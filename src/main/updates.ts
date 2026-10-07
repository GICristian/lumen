import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import type { AppUpdater } from "electron-updater";
import type { UpdateState } from "@shared/contracts";
import { idleUpdate } from "@shared/update";

const { autoUpdater } = createRequire(import.meta.url)("electron-updater") as {
  autoUpdater: AppUpdater;
};

let state: UpdateState = idleUpdate;
let installing = false;
let allowQuit: () => void = () => undefined;
let noticeFile = "";
let dismissedVersion: string | null = null;

function isDismissed(version: string | null): boolean {
  return Boolean(version && dismissedVersion === version);
}

export async function initUpdateNotice(userData: string): Promise<void> {
  noticeFile = path.join(userData, "update-notice.json");
  try {
    const raw = JSON.parse(await fs.readFile(noticeFile, "utf8")) as { dismissed?: unknown };
    dismissedVersion = typeof raw.dismissed === "string" ? raw.dismissed : null;
  } catch {
    dismissedVersion = null;
  }
}

function emit(next: UpdateState): void {
  state = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("update:state", state);
  }
}

function check(): void {
  if (!app.isPackaged) return;
  if (installing || state.phase === "downloading" || state.phase === "ready") return;
  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.error("update check failed", error);
  });
}

/** Watches GitHub releases. A click downloads the installer and restarts into it. */
export function initUpdates(quitForInstall: () => void): void {
  allowQuit = quitForInstall;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (message) => console.log(message),
    warn: (message) => console.warn(message),
    error: (message) => console.error(message),
    debug: (message) => console.debug(message),
  };
  autoUpdater.on("update-available", (info) => {
    if (state.phase === "downloading" || state.phase === "ready") return;
    emit({
      phase: "available",
      version: info.version,
      percent: 0,
      dismissed: isDismissed(info.version),
      message: null,
    });
  });
  autoUpdater.on("download-progress", (progress) => {
    emit({
      phase: "downloading",
      version: state.version,
      percent: progress.percent,
      dismissed: false,
      message: null,
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    emit({ phase: "ready", version: info.version, percent: 100, dismissed: false, message: null });
  });
  autoUpdater.on("error", (error) => {
    if (state.phase === "idle") return;
    installing = false;
    emit({
      phase: "error",
      version: state.version,
      percent: state.percent,
      dismissed: false,
      message: error instanceof Error ? error.message : "The update did not finish.",
    });
  });

  ipcMain.handle("update:state", () => state);
  ipcMain.handle("update:dismiss", async () => {
    if (state.phase !== "available" || !state.version) return state;
    dismissedVersion = state.version;
    if (noticeFile) {
      await fs.mkdir(path.dirname(noticeFile), { recursive: true });
      await fs.writeFile(noticeFile, JSON.stringify({ dismissed: dismissedVersion }));
    }
    emit({ ...state, dismissed: true });
    return state;
  });
  ipcMain.handle("update:install", async () => {
    if (installing || state.phase === "idle" || state.phase === "downloading") return;
    installing = true;
    try {
      if (state.phase !== "ready") {
        emit({
          phase: "downloading",
          version: state.version,
          percent: 0,
          dismissed: false,
          message: null,
        });
        await autoUpdater.downloadUpdate();
      }
      allowQuit();
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      installing = false;
      emit({
        phase: "error",
        version: state.version,
        percent: state.percent,
        dismissed: false,
        message: error instanceof Error ? error.message : "The update did not finish.",
      });
    }
  });

  setTimeout(check, 4000);
  setInterval(check, 60 * 60 * 1000);
}
