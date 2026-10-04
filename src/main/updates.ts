import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateState } from "@shared/contracts";
import { idleUpdate } from "@shared/update";

let state: UpdateState = idleUpdate;
let installing = false;
let allowQuit: () => void = () => undefined;

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
    emit({ phase: "available", version: info.version, percent: 0, message: null });
  });
  autoUpdater.on("update-not-available", () => {
    if (state.phase === "available") emit(idleUpdate);
  });
  autoUpdater.on("download-progress", (progress) => {
    emit({
      phase: "downloading",
      version: state.version,
      percent: progress.percent,
      message: null,
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    emit({ phase: "ready", version: info.version, percent: 100, message: null });
  });
  autoUpdater.on("error", (error) => {
    if (state.phase === "idle") return;
    installing = false;
    emit({
      phase: "error",
      version: state.version,
      percent: state.percent,
      message: error instanceof Error ? error.message : "The update did not finish.",
    });
  });

  ipcMain.handle("update:state", () => state);
  ipcMain.handle("update:install", async () => {
    if (installing || state.phase === "idle" || state.phase === "downloading") return;
    installing = true;
    try {
      if (state.phase !== "ready") {
        emit({ phase: "downloading", version: state.version, percent: 0, message: null });
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
        message: error instanceof Error ? error.message : "The update did not finish.",
      });
    }
  });

  setTimeout(check, 4000);
  setInterval(check, 60 * 60 * 1000);
}
