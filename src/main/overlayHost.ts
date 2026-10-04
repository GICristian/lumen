import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import type { NativeImage } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseAccelerator } from "@shared/shortcut";
import { getSettings, patchSettings } from "./settings";
import {
  focusWindow,
  hwndOf,
  noteForeground,
  releaseCursor,
  releaseRawMouse,
  setMouseSink,
  takeForeground,
} from "./win32";

let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;
let idleIcon: NativeImage | null = null;
let recordIcon: NativeImage | null = null;
let trayRecording = false;
let openPlayer = (): void => undefined;
let currentShortcut = "";
let vaultShortcut = "";
let replayShortcut = "";
let saveReplay = (): void => undefined;
let openVault = (): void => undefined;
let iconFile = "";
let pendingFile: string | null = null;

function rendererUrl(hash: string): string | null {
  const dev = process.env.ELECTRON_RENDERER_URL;
  return dev ? `${dev}#${hash}` : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function placeOverlay(win: BrowserWindow): void {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const area = display.workArea;
  const saved = getSettings().overlayBounds;
  const maxWidth = Math.max(640, Math.min(1280, Math.floor(area.width * .8)));
  const maxHeight = Math.max(420, Math.min(820, Math.floor(area.height * .85)));
  const width = clamp(saved?.width ?? 960, 640, maxWidth);
  const height = clamp(saved?.height ?? 640, 420, maxHeight);
  const x = area.x + Math.round((area.width - width) / 2);
  const y = area.y + Math.round((area.height - height) / 2);
  win.setMinimumSize(Math.min(640, maxWidth), Math.min(420, maxHeight));
  win.setBounds({ x, y, width, height });
}

let boundsTimer: NodeJS.Timeout | null = null;

function rememberOverlayBounds(win: BrowserWindow): void {
  if (!win.isVisible()) return;
  if (boundsTimer) clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    if (win.isDestroyed()) return;
    void patchSettings({ overlayBounds: win.getBounds() });
  }, 300);
}

function createOverlay(): BrowserWindow {
  const win = new BrowserWindow({
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    movable: true,
    minWidth: 640,
    minHeight: 420,
    show: false,
    focusable: false,
    roundedCorners: true,
    backgroundColor: "#1b2026",
    icon: iconFile,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const dev = rendererUrl("/overlay");
  if (dev) void win.loadURL(dev);
  else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "/overlay" });
  }
  const followCursor = (): void => {
    rememberOverlayBounds(win);
  };
  win.on("resize", followCursor);
  win.on("move", followCursor);
  win.on("blur", () => {
    if (!acceptOutside || outsideHold > 0) return;
    if (win.isDestroyed() || !win.isVisible()) return;
    dismissOverlay(win);
  });
  win.on("closed", () => {
    overlay = null;
    acceptOutside = false;
    disarmMouse();
    guard(() => releaseCursor());
  });
  return win;
}

export async function withOverlayRelaxed<T>(
  win: BrowserWindow | null,
  task: () => Promise<T>,
): Promise<T> {
  const relax = Boolean(win && !win.isDestroyed() && win.isAlwaysOnTop());
  if (relax && win) {
    outsideHold += 1;
    disarmMouse();
    guard(() => releaseCursor());
    win.setFocusable(true);
    win.setAlwaysOnTop(false);
  }
  try {
    return await task();
  } finally {
    if (relax) outsideHold = Math.max(0, outsideHold - 1);
    if (relax && win && !win.isDestroyed()) {
      win.setAlwaysOnTop(true, "screen-saver");
      win.setFocusable(true);
      if (win.isVisible()) guard(() => focusWindow(hwndOf(win.getNativeWindowHandle())));
    }
  }
}

function guard(task: () => void): void {
  try {
    task();
  } catch (error) {
    console.error("overlay focus", error);
  }
}

export function beginOverlayDrag(): void {
  const win = overlay;
  if (!win || win.isDestroyed()) return;
  if (!win.isFocusable()) win.setFocusable(true);
  guard(() => focusWindow(hwndOf(win.getNativeWindowHandle())));
}

function disarmMouse(): void {
  guard(() => releaseRawMouse());
  guard(() => setMouseSink(null));
}

let acceptOutside = false;
let outsideHold = 0;
let outsideTimer: NodeJS.Timeout | null = null;

function armOutsideClose(): void {
  acceptOutside = false;
  if (outsideTimer) clearTimeout(outsideTimer);
  outsideTimer = setTimeout(() => {
    acceptOutside = true;
  }, 280);
}

function pauseOverlayMedia(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return Promise.resolve();
  return win.webContents
    .executeJavaScript("document.querySelectorAll('video,audio').forEach((media)=>media.pause())")
    .then(() => undefined)
    .catch(() => undefined);
}

function dismissOverlay(win: BrowserWindow): void {
  acceptOutside = false;
  if (outsideTimer) clearTimeout(outsideTimer);
  disarmMouse();
  guard(() => releaseCursor());
  const game = takeForeground();
  const finish = (): void => {
    if (!win.isDestroyed()) {
      win.hide();
      win.setFocusable(false);
    }
    if (game) guard(() => focusWindow(game));
  };
  void pauseOverlayMedia(win).finally(finish);
}

export function toggleOverlay(): void {
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) {
    dismissOverlay(overlay);
    return;
  }
  pendingFile = null;
  showOverlay();
}

export function openOverlayFile(file: string): void {
  pendingFile = file;
  showOverlay(file);
}

export function openOverlay(): void {
  showOverlay();
}

function showOverlay(file?: string): void {
  if (!file) pendingFile = null;
  if (!overlay || overlay.isDestroyed()) overlay = createOverlay();
  const win = overlay;
  if (!win) return;
  placeOverlay(win);
  if (!win.isVisible()) guard(() => noteForeground([hwndOf(win.getNativeWindowHandle())]));
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const opening = !win.isVisible();
  win.setFocusable(true);
  win.show();
  guard(() => focusWindow(hwndOf(win.getNativeWindowHandle())));
  win.moveTop();
  win.webContents.send("overlay:open", file);
  if (opening) armOutsideClose();
}

export function hideOverlay(): void {
  if (overlay && !overlay.isDestroyed()) dismissOverlay(overlay);
}

export function isOverlayWindow(win: BrowserWindow | null): boolean {
  return Boolean(win && overlay === win);
}

export function focusOverlay(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (!win.isFocusable()) win.setFocusable(true);
  guard(() => focusWindow(hwndOf(win.getNativeWindowHandle())));
}

export function registerOverlayShortcut(accelerator: string): boolean {
  const parsed = parseAccelerator(accelerator);
  if (!parsed || parsed === vaultShortcut || parsed === replayShortcut) return false;
  if (currentShortcut) globalShortcut.unregister(currentShortcut);
  const ok = globalShortcut.register(parsed, toggleOverlay);
  currentShortcut = ok ? parsed : "";
  return ok;
}

export function registerVaultShortcut(accelerator: string): boolean {
  const parsed = parseAccelerator(accelerator);
  if (!parsed || parsed === currentShortcut || parsed === replayShortcut) return false;
  if (vaultShortcut === parsed) return true;
  const ok = globalShortcut.register(parsed, () => openVault());
  if (!ok) return false;
  if (vaultShortcut) globalShortcut.unregister(vaultShortcut);
  vaultShortcut = parsed;
  return true;
}

export function bindReplaySaver(save: () => void): void {
  saveReplay = save;
}

export function registerReplayShortcut(accelerator: string): boolean {
  const parsed = parseAccelerator(accelerator);
  if (!parsed || parsed === currentShortcut || parsed === vaultShortcut) return false;
  if (replayShortcut === parsed) return true;
  const ok = globalShortcut.register(parsed, () => saveReplay());
  if (!ok) return false;
  if (replayShortcut) globalShortcut.unregister(replayShortcut);
  replayShortcut = parsed;
  return true;
}

function paintRecordDot(icon: NativeImage): NativeImage {
  const { width, height } = icon.getSize();
  if (width < 8 || height < 8) return icon;
  const bitmap = icon.toBitmap();
  const radius = Math.max(3, Math.round(width * 0.22));
  const cx = width - radius - 1;
  const cy = height - radius - 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;
      const index = (y * width + x) * 4;
      const edge = dist > radius - 1.25;
      bitmap[index] = edge ? 12 : 43;
      bitmap[index + 1] = edge ? 12 : 59;
      bitmap[index + 2] = edge ? 12 : 255;
      bitmap[index + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width, height });
}

function trayMenu(): Menu {
  const items: Electron.MenuItemConstructorOptions[] = [
    { label: "Open Lumen", click: () => openPlayer() },
    { label: "Open overlay", click: () => showOverlay() },
  ];
  if (trayRecording) items.push({ label: "Recording", enabled: false });
  items.push({ type: "separator" }, { label: "Quit", click: () => app.quit() });
  return Menu.buildFromTemplate(items);
}

export function setTrayTooltip(text: string): void {
  tray?.setToolTip(text);
}

export function setTrayRecording(recording: boolean): void {
  if (!tray || trayRecording === recording) return;
  trayRecording = recording;
  const icon = recording ? recordIcon : idleIcon;
  if (icon && !icon.isEmpty()) tray.setImage(icon);
  tray.setToolTip(recording ? "Lumen — recording" : "Lumen");
  tray.setContextMenu(trayMenu());
}

export function applyLaunchOnStartup(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: ["--hidden"],
  });
}

export function installShell(options: {
  iconPath: string;
  showPlayer: () => void;
  showVault: () => void;
}): void {
  iconFile = options.iconPath;
  openPlayer = options.showPlayer;
  ipcMain.handle("overlay:pending-file", () => {
    const file = pendingFile;
    return file;
  });
  openVault = options.showVault;
  const settings = getSettings();
  if (!registerOverlayShortcut(settings.overlayAccelerator)) {
    console.error("overlay shortcut unavailable", settings.overlayAccelerator);
  }
  if (!registerVaultShortcut(settings.vaultAccelerator)) {
    console.error("vault shortcut unavailable", settings.vaultAccelerator);
  }
  applyLaunchOnStartup(settings.launchOnStartup);

  if (existsSync(options.iconPath)) {
    const source = nativeImage.createFromPath(options.iconPath);
    const scale = screen.getPrimaryDisplay().scaleFactor || 1;
    const size = Math.max(16, Math.round(16 * scale));
    idleIcon = source.isEmpty()
      ? source
      : source.resize({ width: size, height: size, quality: "best" });
    recordIcon = idleIcon.isEmpty() ? idleIcon : paintRecordDot(idleIcon);
    tray = new Tray(idleIcon);
    trayRecording = false;
    tray.setToolTip("Lumen");
    tray.setContextMenu(trayMenu());
    tray.on("click", () => openPlayer());
    tray.on("double-click", () => openPlayer());
  }

  app.on("will-quit", () => {
    disarmMouse();
    guard(() => releaseCursor());
    globalShortcut.unregisterAll();
    tray?.destroy();
  });
}

export async function saveOverlayShortcut(accelerator: string): Promise<void> {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) throw new Error("Shortcut needs Ctrl, Alt, or Shift");
  if (parsed === vaultShortcut || parsed === replayShortcut) {
    throw new Error("That shortcut is already used");
  }
  if (!registerOverlayShortcut(parsed)) throw new Error("That shortcut is already used");
  await patchSettings({ overlayAccelerator: parsed });
}

export async function saveVaultShortcut(accelerator: string): Promise<void> {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) throw new Error("Shortcut needs Ctrl, Alt, or Shift");
  if (parsed === currentShortcut || parsed === replayShortcut) {
    throw new Error("That shortcut is already used");
  }
  if (!registerVaultShortcut(parsed)) throw new Error("That shortcut is already used");
  await patchSettings({ vaultAccelerator: parsed });
}

export async function saveReplayShortcut(accelerator: string): Promise<void> {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) throw new Error("Shortcut needs Ctrl, Alt, or Shift");
  if (parsed === currentShortcut || parsed === vaultShortcut) {
    throw new Error("That shortcut is already used");
  }
  if (!registerReplayShortcut(parsed)) throw new Error("That shortcut is already used");
  await patchSettings({ replayAccelerator: parsed });
}
