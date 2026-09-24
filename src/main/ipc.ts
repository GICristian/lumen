import { BrowserWindow, dialog, shell } from "electron";
import type { ExportRequest, Settings } from "@shared/contracts";
import { rememberFolder } from "@shared/folders";
import { cancelExport, preparePlayback, previewClip, startExport, thumbnail } from "./ffmpeg";
import { listDirectory, listFolder, videoArg } from "./library";
import {
  applyLaunchOnStartup,
  beginOverlayDrag,
  focusOverlay,
  hideOverlay,
  saveOverlayShortcut,
  toggleOverlay,
  withOverlayRelaxed,
} from "./overlayHost";
import { getSettings, patchSettings } from "./settings";

let trayHide = 0;

function stopPlayback(win: BrowserWindow): void {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return;
  win.webContents.send("player:hidden");
}

export function hideToTray(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  stopPlayback(win);
  const ticket = ++trayHide;
  const conceal = (): void => {
    if (ticket !== trayHide || win.isDestroyed()) return;
    win.hide();
  };
  if (win.isFullScreen()) {
    win.once("leave-full-screen", conceal);
    win.setFullScreen(false);
    return;
  }
  conceal();
}

export function revealWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  trayHide += 1;
  if (win.isMinimized()) win.restore();
  win.setAlwaysOnTop(true);
  win.show();
  win.moveTop();
  win.focus();
  win.setAlwaysOnTop(false);
}

const filters = [
  {
    name: "Video",
    extensions: ["mp4", "mkv", "mov", "webm", "m4v", "avi"],
  },
];

export function registerIpc(
  ipcMain: Electron.IpcMain,
  getWindow: () => BrowserWindow | null,
  playbackCache: string,
  thumbCache: string,
): void {
  const send = (channel: string, payload: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  };

  const caller = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(event.sender);

  ipcMain.handle("app:initialFile", () => videoArg(process.argv));

  ipcMain.handle("dialog:open", async (event) => {
    const win = caller(event) ?? getWindow();
    return withOverlayRelaxed(win, async () => {
      const result = win
        ? await dialog.showOpenDialog(win, { filters, properties: ["openFile"] })
        : await dialog.showOpenDialog({ filters, properties: ["openFile"] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });
  });

  const remember = async (folder: string) => {
    const settings = getSettings();
    await patchSettings({
      lastFolder: folder,
      recentFolders: rememberFolder(settings.recentFolders, folder),
    });
  };

  ipcMain.handle("library:list", async (_event, filePath: string) => {
    const listing = await listFolder(filePath);
    await remember(listing.folder);
    return listing;
  });

  ipcMain.handle("library:folder", async (_event, folderPath: string) => {
    const listing = await listDirectory(folderPath);
    await remember(listing.folder);
    return listing;
  });

  ipcMain.handle("dialog:folder", async (event) => {
    const win = caller(event) ?? getWindow();
    return withOverlayRelaxed(win, async () => {
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ["openDirectory"] })
        : await dialog.showOpenDialog({ properties: ["openDirectory"] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });
  });

  ipcMain.handle("media:prepare", (_event, filePath: string) =>
    preparePlayback(filePath, playbackCache),
  );

  ipcMain.handle(
    "media:thumb",
    (_event, filePath: string, duration: number | null) =>
      thumbnail(filePath, thumbCache, duration),
  );

  ipcMain.handle("media:preview", (_event, filePath: string) =>
    previewClip(filePath, playbackCache),
  );

  ipcMain.handle("settings:get", () => getSettings());

  ipcMain.handle("settings:set", (_event, patch: Partial<Settings>) => patchSettings(patch));

  ipcMain.handle("shell:showItem", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("shell:openDefaultApps", () => {
    return shell.openExternal("ms-settings:defaultapps");
  });

  ipcMain.handle("export:start", (_event, request: ExportRequest) =>
    startExport(request, {
      progress: (payload) => send("export:progress", payload),
      done: (payload) => send("export:done", payload),
      error: (payload) => send("export:error", payload),
    }),
  );

  ipcMain.handle("export:cancel", (_event, jobId: string) => {
    cancelExport(jobId);
  });

  ipcMain.on("window:minimize", () => getWindow()?.minimize());
  ipcMain.on("window:maximize", () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on("window:close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow();
    if (win) hideToTray(win);
  });
  ipcMain.on("overlay:toggle", () => toggleOverlay());
  ipcMain.on("overlay:hide", () => hideOverlay());
  ipcMain.on("overlay:focus", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) focusOverlay(win);
  });
  ipcMain.on("overlay:drag", () => beginOverlayDrag());
  ipcMain.handle("overlay:shortcut", async (_event, accelerator: string) => {
    await saveOverlayShortcut(accelerator);
    return getSettings();
  });
  ipcMain.handle("overlay:startup", async (_event, enabled: boolean) => {
    applyLaunchOnStartup(enabled === true);
    return patchSettings({ launchOnStartup: enabled === true });
  });
  ipcMain.on("window:fullscreen", () => {
    const win = getWindow();
    if (!win) return;
    win.setFullScreen(!win.isFullScreen());
  });
  ipcMain.on("window:title", (_event, title: string) => {
    getWindow()?.setTitle(title);
  });
}
