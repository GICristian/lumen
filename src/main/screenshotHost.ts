import { BrowserWindow, ClipboardItem, clipboard, desktopCapturer, globalShortcut, screen, type Display } from "electron";
import { currentForeground, focusWindow, hwndOf, showOnTop } from "./win32";
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
  bindKey("Return", () => send("save"));
}

function keepGame(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const ours = hwndOf(win.getNativeWindowHandle());
  const foreground = currentForeground();
  if (foreground !== 0n && foreground !== ours) game = foreground;
  if (game && currentForeground() !== game) focusWindow(game);
}

export function closeScreenshot(): void {
  generation += 1;
  frameUrl = "";
  pendingShow = false;
  disarmKeys();
  const win = shotWindow;
  const target = game;
  if (win && !win.isDestroyed()) {
    win.hide();
    win.setFocusable(false);
  }
  if (target && currentForeground() !== target) focusWindow(target);
  game = null;
}

function thumbSize(display: Display): { width: number; height: number } {
  const edge = Math.max(display.size.width, display.size.height);
  const factor = edge > 1920 ? 1920 / edge : 1;
  return {
    width: Math.max(1, Math.round(display.size.width * factor)),
    height: Math.max(1, Math.round(display.size.height * factor)),
  };
}

async function capture(win: BrowserWindow, display: Display, ticket: number): Promise<void> {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: thumbSize(display),
    fetchWindowIcons: false,
  });
  if (ticket !== generation || win.isDestroyed()) return;
  const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    console.error("screenshot capture failed");
    return;
  }
  frameUrl = `data:image/jpeg;base64,${source.thumbnail.toJPEG(72).toString("base64")}`;
  if (ticket !== generation || win.isDestroyed()) return;
  const send = (): void => {
    if (ticket === generation && !win.isDestroyed()) win.webContents.send("screenshot:ready", frameUrl);
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
  win.setFocusable(false);
  const before = currentForeground();
  const ours = hwndOf(win.getNativeWindowHandle());
  if (before !== 0n && before !== ours) game = before;
  win.showInactive();
  showOnTop(ours);
  keepGame(win);
  armKeys(win);
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
  const ticket = generation;
  frameUrl = "";
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  win.setBounds(display.bounds);
  if (!win.webContents.isLoading()) win.webContents.send("screenshot:reset");
  reveal(win);
  void capture(win, display, ticket);
}
