import { app, BrowserWindow, globalShortcut, Menu, screen, Tray } from "electron";
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
let currentShortcut = "";
let iconFile = "";

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
  const maxWidth = Math.max(640, area.width - 24);
  const maxHeight = Math.max(420, area.height - 24);
  const width = clamp(saved?.width ?? 1120, 640, maxWidth);
  const height = clamp(saved?.height ?? 760, 420, maxHeight);
  const x = area.x + Math.round((area.width - width) / 2);
  const y = area.y + Math.round((area.height - height) / 2);
  win.setMinimumSize(Math.min(760, maxWidth), Math.min(520, maxHeight));
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
    minWidth: 760,
    minHeight: 520,
    show: false,
    focusable: false,
    roundedCorners: true,
    backgroundColor: "#07080d",
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
  win.on("closed", () => {
    overlay = null;
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
    disarmMouse();
    guard(() => releaseCursor());
    win.setFocusable(true);
    win.setAlwaysOnTop(false);
  }
  try {
    return await task();
  } finally {
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

function dismissOverlay(win: BrowserWindow): void {
  disarmMouse();
  guard(() => releaseCursor());
  const game = takeForeground();
  if (!win.isDestroyed()) {
    win.hide();
    win.setFocusable(false);
  }
  if (game) guard(() => focusWindow(game));
}

export function toggleOverlay(): void {
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) {
    dismissOverlay(overlay);
    return;
  }
  if (!overlay || overlay.isDestroyed()) overlay = createOverlay();
  const win = overlay;
  if (!win) return;
  placeOverlay(win);
  guard(() => noteForeground([hwndOf(win.getNativeWindowHandle())]));
  win.setFocusable(true);
  win.show();
  guard(() => focusWindow(hwndOf(win.getNativeWindowHandle())));
  win.webContents.send("overlay:open");
}

export function hideOverlay(): void {
  if (overlay && !overlay.isDestroyed()) dismissOverlay(overlay);
}

export function focusOverlay(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (!win.isFocusable()) win.setFocusable(true);
  guard(() => focusWindow(hwndOf(win.getNativeWindowHandle())));
}

export function registerOverlayShortcut(accelerator: string): boolean {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return false;
  if (currentShortcut) globalShortcut.unregister(currentShortcut);
  const ok = globalShortcut.register(parsed, toggleOverlay);
  currentShortcut = ok ? parsed : "";
  return ok;
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
}): void {
  iconFile = options.iconPath;
  const settings = getSettings();
  if (!registerOverlayShortcut(settings.overlayAccelerator)) {
    console.error("overlay shortcut unavailable", settings.overlayAccelerator);
  }
  applyLaunchOnStartup(settings.launchOnStartup);

  if (existsSync(options.iconPath)) {
    tray = new Tray(options.iconPath);
    tray.setToolTip("Lumen");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open overlay", click: toggleOverlay },
        { label: "Open player", click: options.showPlayer },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
    tray.on("click", toggleOverlay);
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
  if (!registerOverlayShortcut(parsed)) throw new Error("That shortcut is already used");
  await patchSettings({ overlayAccelerator: parsed });
}
