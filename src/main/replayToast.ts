import { BrowserWindow, screen } from "electron";
import path from "node:path";

let toast: BrowserWindow | null = null;
let dismissTimer: NodeJS.Timeout | null = null;

export function dismissReplayToast(): void {
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = null;
  toast?.destroy();
  toast = null;
}

/** Small, non-activating feedback above the foreground app, independent of Lumen's window. */
export function showReplayToast(finished = false): void {
  if (dismissTimer) clearTimeout(dismissTimer);
  if (!toast || toast.isDestroyed()) {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const win = new BrowserWindow({ width: 360, height: 188,
      x: area.x + area.width - 380, y: area.y + 24,
      frame: false, show: false, resizable: false, skipTaskbar: true, alwaysOnTop: true,
      backgroundColor: "#282e35", roundedCorners: true,
      webPreferences: { preload: path.join(__dirname, "../preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    toast = win;
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setContentProtection(true);
    win.once("ready-to-show", () => { if (!win.isDestroyed()) win.showInactive(); });
    win.on("closed", () => { if (toast === win) toast = null; });
    const dev = process.env.ELECTRON_RENDERER_URL;
    if (dev) void win.loadURL(`${dev}#/replay-toast`);
    else void win.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "/replay-toast" });
  }
  // Completed feedback stays long enough to read and act on; never takes keyboard focus.
  if (finished) dismissTimer = setTimeout(dismissReplayToast, 15000);
}
