import {
  BrowserWindow,
  ClipboardItem,
  clipboard,
  desktopCapturer,
  globalShortcut,
  screen,
  type DesktopCapturerSource,
  type Display,
} from "electron";
import { keyDown } from "./macroInput";
import { reclaimRawMouse } from "./soundboardHost";
import {
  armRawMouse,
  currentForeground,
  disarmRawMouse,
  focusWindow,
  foregroundFrame,
  hwndOf,
  isWindowIconic,
  readRawMouse,
  showOnTop,
} from "./win32";
import { promises as fs } from "node:fs";
import path from "node:path";
import { lumenReplayRoot } from "./lumenFolders";

let shotWindow: BrowserWindow | null = null;
let frameUrl = "";
let generation = 0;
let pendingShow = false;
let game: bigint | null = null;
const heldKeys = new Set<string>();

function shotName(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `Shot ${day} ${time}.png`;
}

async function nextShotPath(): Promise<string> {
  const directory = path.join(lumenReplayRoot(), "Screenshots");
  await fs.mkdir(directory, { recursive: true });
  const base = shotName(new Date());
  const first = path.join(directory, base);
  try {
    await fs.access(first);
  } catch {
    return first;
  }
  const stem = base.replace(/\.png$/, "");
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(directory, `${stem}_${index}.png`);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
  return path.join(directory, `${stem}_${Date.now()}.png`);
}

export function screenshotFrame(): string {
  return frameUrl;
}

export async function saveScreenshot(bytes: Uint8Array): Promise<string> {
  const filePath = await nextShotPath();
  await fs.writeFile(filePath, Buffer.from(bytes));
  return filePath;
}

export async function copyScreenshot(bytes: Uint8Array): Promise<void> {
  const blob = new Blob([Buffer.from(bytes)], { type: "image/png" });
  await clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

function bindKey(accelerator: string, run: () => void): void {
  if (globalShortcut.isRegistered(accelerator)) return;
  if (globalShortcut.register(accelerator, run)) heldKeys.add(accelerator);
}

function disarmKeys(): void {
  for (const accelerator of heldKeys) globalShortcut.unregister(accelerator);
  heldKeys.clear();
}

function armKeys(win: BrowserWindow): void {
  disarmKeys();
  const send = (kind: "copy" | "save" | "undo"): void => {
    if (!win.isDestroyed()) win.webContents.send("screenshot:command", kind);
  };
  bindKey("Escape", () => closeScreenshot());
  bindKey("CommandOrControl+C", () => send("copy"));
  bindKey("CommandOrControl+S", () => send("save"));
  bindKey("CommandOrControl+Z", () => send("undo"));
  bindKey("Return", () => send("copy"));
}

function raise(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  win.setAlwaysOnTop(true, "screen-saver");
  showOnTop(hwndOf(win.getNativeWindowHandle()));
}

const WM_INPUT = 0x00ff;

let cursorPoll: ReturnType<typeof setInterval> | null = null;
let holdTimer: ReturnType<typeof setInterval> | null = null;
let buttonWas = false;
let lastX = Number.NaN;
let lastY = Number.NaN;
let rawHooked = false;
let rawX = 0;
let rawY = 0;
let anchorRawX = 0;
let anchorRawY = 0;
let anchorCursor = { x: 0, y: 0 };
let virtualX = 0;
let virtualY = 0;
let stickToRaw = false;
let countsPerPixel = 6;

function pointerOf(buffer: Buffer): bigint {
  if (buffer.length >= 8) return buffer.readBigUInt64LE(0);
  if (buffer.length >= 4) return BigInt(buffer.readUInt32LE(0));
  return 0n;
}

function onRaw(_wParam: Buffer, lParam: Buffer): void {
  try {
    const move = readRawMouse(pointerOf(lParam));
    if (!move || move.absolute) return;
    rawX += move.dx;
    rawY += move.dy;
  } catch {
    /* The packet is only valid inside this message. */
  }
}

function stopHold(): void {
  if (holdTimer) clearInterval(holdTimer);
  holdTimer = null;
}

/** If showing the selector activates us, hand the foreground back to the game. */
function holdGame(win: BrowserWindow): void {
  stopHold();
  let tries = 0;
  holdTimer = setInterval(() => {
    tries += 1;
    if (tries > 8 || win.isDestroyed() || !win.isVisible()) {
      stopHold();
      return;
    }
    if (!game) return;
    const ours = hwndOf(win.getNativeWindowHandle());
    if (currentForeground() === ours || isWindowIconic(game)) focusWindow(game);
  }, 40);
}

function stopCursor(): void {
  if (cursorPoll) clearInterval(cursorPoll);
  cursorPoll = null;
  buttonWas = false;
  lastX = Number.NaN;
  lastY = Number.NaN;
  stickToRaw = false;
  if (shotWindow && !shotWindow.isDestroyed() && rawHooked) {
    shotWindow.unhookWindowMessage(WM_INPUT);
  }
  if (rawHooked) {
    rawHooked = false;
    disarmRawMouse();
    reclaimRawMouse();
  }
}

function pointOnWindow(win: BrowserWindow): { x: number; y: number } {
  const cursor = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  const pixelDx = cursor.x - anchorCursor.x;
  const pixelDy = cursor.y - anchorCursor.y;
  const rawDx = rawX - anchorRawX;
  const rawDy = rawY - anchorRawY;
  const cursorMoved = pixelDx * pixelDx + pixelDy * pixelDy >= 4;
  const rawMoved = rawDx * rawDx + rawDy * rawDy >= 9;
  if (cursorMoved) {
    stickToRaw = false;
    virtualX = cursor.x;
    virtualY = cursor.y;
    if (Math.abs(pixelDx) >= 3 && Math.abs(rawDx) >= 6) {
      const ratio = Math.abs(rawDx / pixelDx);
      if (ratio >= 1 && ratio <= 64) countsPerPixel = countsPerPixel * 0.6 + ratio * 0.4;
    }
    anchorCursor = cursor;
    anchorRawX = rawX;
    anchorRawY = rawY;
  } else if (rawMoved) {
    stickToRaw = true;
    const scale = screen.getDisplayNearestPoint(cursor).scaleFactor || 1;
    virtualX += rawDx / countsPerPixel / scale;
    virtualY += rawDy / countsPerPixel / scale;
    const area = screen.getDisplayNearestPoint({ x: virtualX, y: virtualY }).bounds;
    virtualX = Math.min(area.x + area.width - 1, Math.max(area.x, virtualX));
    virtualY = Math.min(area.y + area.height - 1, Math.max(area.y, virtualY));
    anchorRawX = rawX;
    anchorRawY = rawY;
  }
  const screenX = stickToRaw ? virtualX : cursor.x;
  const screenY = stickToRaw ? virtualY : cursor.y;
  return {
    x: Math.min(bounds.width - 1, Math.max(0, Math.round(screenX - bounds.x))),
    y: Math.min(bounds.height - 1, Math.max(0, Math.round(screenY - bounds.y))),
  };
}

/** Follow the cursor without activating this window. Raw deltas cover a locked cursor. */
function startCursor(win: BrowserWindow): void {
  stopCursor();
  const start = screen.getCursorScreenPoint();
  anchorCursor = start;
  virtualX = start.x;
  virtualY = start.y;
  rawX = 0;
  rawY = 0;
  anchorRawX = 0;
  anchorRawY = 0;
  const hwnd = hwndOf(win.getNativeWindowHandle());
  if (armRawMouse(hwnd)) {
    win.hookWindowMessage(WM_INPUT, onRaw);
    rawHooked = true;
  }
  cursorPoll = setInterval(() => {
    if (win.isDestroyed() || !win.isVisible() || win.webContents.isLoading()) return;
    const point = pointOnWindow(win);
    const down = keyDown(1);
    if (down && !buttonWas) {
      buttonWas = true;
      lastX = point.x;
      lastY = point.y;
      win.webContents.send("screenshot:pointer", { ...point, phase: "down" });
      return;
    }
    if (!down && buttonWas) {
      buttonWas = false;
      lastX = point.x;
      lastY = point.y;
      win.webContents.send("screenshot:pointer", { ...point, phase: "up" });
      return;
    }
    if (point.x === lastX && point.y === lastY) return;
    lastX = point.x;
    lastY = point.y;
    win.webContents.send("screenshot:pointer", { ...point, phase: "move" });
  }, 8);
}

function coversDisplay(
  frame: { right: number; left: number; bottom: number; top: number },
  display: Display,
): boolean {
  const scale = display.scaleFactor || 1;
  const minWidth = display.bounds.width * scale * 0.7;
  const minHeight = display.bounds.height * scale * 0.7;
  return frame.right - frame.left >= minWidth && frame.bottom - frame.top >= minHeight;
}

function shotTarget(ours: bigint): { display: Display; game: bigint | null } {
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const frame = foregroundFrame();
  const hwnd = currentForeground();
  if (!frame || hwnd === 0n || hwnd === ours) return { display: cursorDisplay, game: null };
  let center = {
    x: Math.round((frame.left + frame.right) / 2),
    y: Math.round((frame.top + frame.bottom) / 2),
  };
  try {
    center = screen.screenToDipPoint(center);
  } catch {
    return { display: cursorDisplay, game: null };
  }
  const covered = screen.getDisplayNearestPoint(center);
  if (!coversDisplay(frame, covered)) return { display: cursorDisplay, game: null };
  return { display: covered, game: hwnd };
}

export function closeScreenshot(): void {
  pendingShow = false;
  disarmKeys();
  stopHold();
  stopCursor();
  const win = shotWindow;
  const target = game;
  const ours = win && !win.isDestroyed() ? hwndOf(win.getNativeWindowHandle()) : 0n;
  if (win && !win.isDestroyed()) {
    win.hide();
    win.setFocusable(false);
  }
  if (target && ours !== 0n && currentForeground() === ours && !isWindowIconic(target)) {
    focusWindow(target);
  }
  game = null;
}

function thumbSize(display: Display): { width: number; height: number } {
  const scale = display.scaleFactor || 1;
  return {
    width: Math.max(1, Math.round(display.size.width * scale)),
    height: Math.max(1, Math.round(display.size.height * scale)),
  };
}

async function capture(win: BrowserWindow, display: Display, ticket: number): Promise<void> {
  let sources: DesktopCapturerSource[] = [];
  try {
    sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: thumbSize(display),
      fetchWindowIcons: false,
    });
  } catch (error) {
    console.error("screenshot capture", error);
    return;
  }
  if (ticket !== generation || win.isDestroyed()) return;
  const screenShot = sources.find((item) => item.display_id === String(display.id))
    ?? sources.find((item) => item.id.startsWith("screen:"));
  const source = screenShot;
  if (!source || source.thumbnail.isEmpty()) {
    console.error("screenshot capture failed");
    return;
  }
  const png = source.thumbnail.toPNG();
  frameUrl = `data:image/png;base64,${png.toString("base64")}`;
  if (ticket !== generation || win.isDestroyed()) return;
  const send = (): void => {
    if (ticket === generation && !win.isDestroyed()) {
      win.webContents.send("screenshot:ready", frameUrl);
    }
  };
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
  else send();
}

function loadShot(win: BrowserWindow): void {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) void win.loadURL(`${dev}#/screenshot`);
  else void win.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "/screenshot" });
}

function reveal(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.webContents.isLoading() && !pendingShow) {
    pendingShow = true;
    return;
  }
  pendingShow = false;
  const before = currentForeground();
  const ours = hwndOf(win.getNativeWindowHandle());
  if (before !== 0n && before !== ours) game = before;
  win.setFocusable(false);
  win.showInactive();
  raise(win);
  if (game && (currentForeground() === ours || isWindowIconic(game))) focusWindow(game);
  armKeys(win);
  startCursor(win);
  holdGame(win);
}

/** Keep the selector loaded so the shortcut only has to show it. */
export function warmScreenshot(): void {
  if (shotWindow && !shotWindow.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    show: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreen: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  shotWindow = win;
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(true);
  win.webContents.setBackgroundThrottling(false);
  win.on("closed", () => {
    if (shotWindow === win) shotWindow = null;
  });
  win.once("ready-to-show", () => {
    if (pendingShow && !win.isDestroyed()) reveal(win);
  });
  loadShot(win);
}

/** Show the selector at once, then paint the screen under the cursor. */
export async function openScreenshot(): Promise<void> {
  if (shotWindow && !shotWindow.isDestroyed() && shotWindow.isVisible()) {
    closeScreenshot();
    return;
  }
  warmScreenshot();
  const win = shotWindow;
  if (!win || win.isDestroyed()) return;
  generation += 1;
  const ticket = generation;
  frameUrl = "";
  const target = shotTarget(hwndOf(win.getNativeWindowHandle()));
  win.setBounds(target.display.bounds);
  if (!win.webContents.isLoading()) win.webContents.send("screenshot:reset");
  reveal(win);
  const display = target.display;
  setTimeout(() => {
    if (ticket === generation) void capture(win, display, ticket);
  }, 40);
}
