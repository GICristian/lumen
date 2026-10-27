import { promises as fs } from "node:fs";
import path from "node:path";
import { BrowserWindow, screen, shell } from "electron";
import {
  keyChord,
  MAX_WHEEL_SOUNDS,
  SOUND_EXTENSIONS,
  wheelAim,
  wheelIndex,
  type SoundClip,
} from "@shared/plugins";
import type { Settings } from "@shared/contracts";
import { getSettings } from "./settings";
import {
  armRawMouse,
  currentForeground,
  disarmRawMouse,
  focusWindow,
  hwndOf,
  readRawMouse,
  showOnTop,
  watchChord,
} from "./win32";

const WHEEL = 420;
const WM_INPUT = 0x00ff;
const RAW_COUNTS_PER_PIXEL = 6;
const extensions = new Set<string>(SOUND_EXTENSIONS);

let soundsDir = "";
let volume = 0.85;
let wheel: BrowserWindow | null = null;
let center = { x: 0, y: 0 };
let sounds: SoundClip[] = [];
let openTicket = 0;
let aimTimer: NodeJS.Timeout | null = null;
let cached: { stamp: number; sounds: SoundClip[] } | null = null;
let armed = "";
let pending: { channel: string; payload?: unknown }[] = [];
let holding = false;
let aimX = 0;
let aimY = 0;
let rawHeard = false;
let rawMode: "none" | "relative" | "absolute" = "none";
let lastAbsolute: { x: number; y: number } | null = null;
let rawHooked = false;
let rawErrorLogged = false;

const note = [
  "Drop short .wav, .mp3, or .ogg files in this folder.",
  "The file name is the label on the wheel.",
  "Lumen uses the first 12 names, in alphabetical order.",
  "Hold the soundboard key, aim, and release.",
].join("\n");

function reserved(settings: Settings): boolean {
  const accelerator = settings.soundboardAccelerator;
  return accelerator === settings.overlayAccelerator
    || accelerator === settings.vaultAccelerator
    || accelerator === settings.replayAccelerator
    || accelerator === settings.screenshotAccelerator;
}

async function ensureFolder(): Promise<void> {
  await fs.mkdir(soundsDir, { recursive: true });
  const readme = path.join(soundsDir, "SOUNDS.txt");
  await fs.writeFile(readme, note, { flag: "wx" }).catch(() => undefined);
}

async function listSounds(): Promise<SoundClip[]> {
  await ensureFolder();
  const info = await fs.stat(soundsDir);
  if (cached && cached.stamp === info.mtimeMs) return cached.sounds;
  const names = (await fs.readdir(soundsDir))
    .filter((name) => extensions.has(path.extname(name).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: "base",
    }))
    .slice(0, MAX_WHEEL_SOUNDS);
  const listed = names.map((name) => {
    const dot = name.lastIndexOf(".");
    return {
      name: dot > 0 ? name.slice(0, dot) : name,
      path: path.join(soundsDir, name),
    };
  });
  const next = await fs.stat(soundsDir);
  cached = { stamp: next.mtimeMs, sounds: listed };
  return listed;
}

export async function soundboardLibrary(): Promise<{ folder: string; sounds: SoundClip[] }> {
  return { folder: soundsDir, sounds: await listSounds() };
}

export async function openSoundboardFolder(): Promise<void> {
  await ensureFolder();
  cached = null;
  await shell.openPath(soundsDir);
}

function loadWheel(win: BrowserWindow): void {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) void win.loadURL(`${dev}#/soundboard`);
  else void win.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "/soundboard" });
}

function warmWheel(): void {
  if (wheel && !wheel.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: WHEEL,
    height: WHEEL,
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
  wheel = win;
  win.webContents.setBackgroundThrottling(false);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true);
  win.setContentProtection(true);
  win.on("closed", () => {
    if (wheel !== win) return;
    wheel = null;
    rawHooked = false;
    disarmRawMouse();
  });
  win.webContents.on("did-finish-load", () => {
    const queued = pending;
    pending = [];
    for (const item of queued) send(item.channel, item.payload);
  });
  loadWheel(win);
}

function send(channel: string, payload?: unknown): void {
  if (!wheel || wheel.isDestroyed()) return;
  if (wheel.webContents.isLoading()) {
    if (channel === "soundboard:aim") {
      pending = pending.filter((item) => item.channel !== "soundboard:aim");
    }
    pending.push({ channel, payload });
    return;
  }
  wheel.webContents.send(channel, payload);
}

function reveal(win: BrowserWindow): void {
  win.setFocusable(false);
  const before = currentForeground();
  const ours = hwndOf(win.getNativeWindowHandle());
  win.showInactive();
  showOnTop(ours);
  if (before !== 0n && currentForeground() === ours) focusWindow(before);
}

function hideWheel(): void {
  if (aimTimer) clearInterval(aimTimer);
  aimTimer = null;
  send("soundboard:hide");
  if (wheel && !wheel.isDestroyed()) wheel.hide();
}

function pointerOf(buffer: Buffer): bigint {
  if (buffer.length >= 8) return buffer.readBigUInt64LE(0);
  if (buffer.length >= 4) return BigInt(buffer.readUInt32LE(0));
  return 0n;
}

function onRaw(_w: Buffer, lParam: Buffer): void {
  try {
    const move = readRawMouse(pointerOf(lParam));
    if (!holding || !move) return;
    if (move.absolute) {
      if (rawMode === "relative") return;
      rawMode = "absolute";
      if (lastAbsolute) {
        aimX += move.dx - lastAbsolute.x;
        aimY += move.dy - lastAbsolute.y;
        rawHeard = true;
      }
      lastAbsolute = { x: move.dx, y: move.dy };
      return;
    }
    if (rawMode === "absolute" || (move.dx === 0 && move.dy === 0)) return;
    rawMode = "relative";
    aimX += move.dx;
    aimY += move.dy;
    rawHeard = true;
  } catch (error) {
    if (rawErrorLogged) return;
    rawErrorLogged = true;
    console.error("soundboard mouse", error);
  }
}

function hookRaw(win: BrowserWindow): void {
  if (rawHooked) return;
  const hwnd = hwndOf(win.getNativeWindowHandle());
  if (!armRawMouse(hwnd)) {
    console.error("soundboard mouse was not installed");
    return;
  }
  win.hookWindowMessage(WM_INPUT, onRaw);
  rawHooked = true;
}

/** The screenshot selector borrows raw input, then the wheel takes it back. */
export function reclaimRawMouse(): void {
  if (!rawHooked || !wheel || wheel.isDestroyed()) return;
  armRawMouse(hwndOf(wheel.getNativeWindowHandle()));
}

function stopRaw(): void {
  if (wheel && !wheel.isDestroyed() && rawHooked) wheel.unhookWindowMessage(WM_INPUT);
  rawHooked = false;
  disarmRawMouse();
}

function aimOffset(): { dx: number; dy: number } {
  const cursor = screen.getCursorScreenPoint();
  return wheelAim(
    cursor.x - center.x,
    cursor.y - center.y,
    aimX / RAW_COUNTS_PER_PIXEL,
    aimY / RAW_COUNTS_PER_PIXEL,
    rawHeard,
  );
}

function aim(): void {
  send("soundboard:aim", aimOffset());
}

async function openWheel(): Promise<void> {
  const ticket = ++openTicket;
  const cursor = screen.getCursorScreenPoint();
  center = cursor;
  holding = true;
  aimX = 0;
  aimY = 0;
  rawHeard = false;
  rawMode = "none";
  lastAbsolute = null;
  try {
    sounds = await listSounds();
  } catch (error) {
    if (ticket === openTicket) holding = false;
    console.error("soundboard", error);
    return;
  }
  if (ticket !== openTicket) return;
  warmWheel();
  const win = wheel;
  if (!win || win.isDestroyed()) return;
  win.setBounds({
    x: Math.round(cursor.x - WHEEL / 2),
    y: Math.round(cursor.y - WHEEL / 2),
    width: WHEEL,
    height: WHEEL,
  });
  send("soundboard:open", { sounds, volume });
  reveal(win);
  if (aimTimer) clearInterval(aimTimer);
  aimTimer = setInterval(aim, 32);
  hookRaw(win);
}

function releaseWheel(): void {
  openTicket += 1;
  holding = false;
  const offset = aimOffset();
  const index = wheelIndex(offset.dx, offset.dy, sounds.length);
  const chosen = index === null ? null : sounds[index];
  if (chosen) send("soundboard:play", { path: chosen.path, volume });
  hideWheel();
}

/** Arm or disarm the hold wheel from the saved plugin settings. */
export function applySoundboard(settings: Settings): void {
  volume = settings.soundboardVolume;
  const chord = keyChord(settings.soundboardAccelerator);
  const token = settings.soundboardEnabled && chord && !reserved(settings)
    ? settings.soundboardAccelerator
    : "";
  if (token === armed) return;
  armed = token;
  if (!token || !chord) {
    watchChord(null, () => undefined, () => undefined);
    holding = false;
    stopRaw();
    hideWheel();
    return;
  }
  warmWheel();
  if (wheel && !wheel.isDestroyed()) hookRaw(wheel);
  watchChord(chord, () => { void openWheel(); }, releaseWheel);
}

export function initSoundboard(userData: string): void {
  soundsDir = path.join(userData, "plugins", "soundboard", "sounds");
  void ensureFolder();
  applySoundboard(getSettings());
}
