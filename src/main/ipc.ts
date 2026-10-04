import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BrowserWindow, dialog, shell } from "electron";
import type { ExportRequest, Settings } from "@shared/contracts";
import { rememberFolder } from "@shared/folders";
import { srtToVtt } from "@shared/srt";
import { fetchSubtitle, searchSubtitles, syncSubtitles } from "./subtitles";
import {
  cancelExport,
  capturePoster,
  preparePlayback,
  previewClip,
  startExport,
  thumbnail,
} from "./ffmpeg";
import { deleteVideos, listDirectory, listFolder, videoArg } from "./library";
import {
  applyLaunchOnStartup,
  beginOverlayDrag,
  focusOverlay,
  hideOverlay,
  isOverlayWindow,
  openOverlay,
  saveOverlayShortcut,
  saveVaultShortcut,
  toggleOverlay,
  withOverlayRelaxed,
} from "./overlayHost";
import {
  isVaultPath,
  vaultAdd,
  vaultCopyKey,
  vaultCreate,
  vaultDecryptOutside,
  vaultList,
  vaultLock,
  vaultMaterialize,
  vaultReadPoster,
  vaultRemove,
  vaultStatus,
  vaultStorePoster,
  vaultUnlock,
} from "./vault";
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

async function rememberPoster(source: string, id: string): Promise<string | null> {
  const still = path.join(tmpdir(), `lumen-still-${id}.jpg`);
  try {
    const ok = await capturePoster(source, still);
    if (!ok) return null;
    return vaultStorePoster(id, await fs.readFile(still));
  } catch (error) {
    console.error("vault poster failed", error);
    return null;
  } finally {
    await fs.rm(still, { force: true });
  }
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

  ipcMain.handle("subtitles:search", (_event, query: string, language: string) =>
    searchSubtitles(String(query ?? ""), String(language ?? "eng")),
  );

  ipcMain.handle("subtitles:fetch", (_event, url: string) => fetchSubtitle(String(url ?? "")));

  ipcMain.handle("subtitles:read", async (_event, filePath: string) => {
    const picked = String(filePath ?? "");
    const ext = path.extname(picked).toLowerCase();
    if (ext !== ".srt" && ext !== ".vtt") throw new Error("Drop a .srt or .vtt file");
    const raw = await fs.readFile(picked, "utf8");
    return { vtt: srtToVtt(raw), label: path.basename(picked) };
  });

  ipcMain.handle(
    "subtitles:sync",
    (_event, filePath: string, vtt: string, duration: number) =>
      syncSubtitles(String(filePath ?? ""), String(vtt ?? ""), Number(duration) || 0),
  );

  ipcMain.handle("subtitles:file", async (event) => {
    const win = caller(event) ?? getWindow();
    return withOverlayRelaxed(win, async () => {
      const result = win
        ? await dialog.showOpenDialog(win, {
          filters: [{ name: "Subtitles", extensions: ["srt", "vtt"] }],
          properties: ["openFile"],
        })
        : await dialog.showOpenDialog({
          filters: [{ name: "Subtitles", extensions: ["srt", "vtt"] }],
          properties: ["openFile"],
        });
      const picked = result.canceled ? null : (result.filePaths[0] ?? null);
      if (!picked) return null;
      const raw = await fs.readFile(picked, "utf8");
      return srtToVtt(raw);
    });
  });

  ipcMain.handle("library:delete", (_event, paths: string[]) => {
    if (!Array.isArray(paths)) return { deleted: [], failed: [] };
    return deleteVideos(paths.filter((item) => typeof item === "string"));
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

  ipcMain.handle("dialog:export", async (event, sourcePath: string, suffix: "trim" | "edit") => {
    const win = caller(event) ?? getWindow();
    const settings = getSettings();
    const source = path.parse(sourcePath);
    const defaultPath = path.join(settings.exportDirectory ?? source.dir, `${source.name}_${suffix}.mp4`);
    const options = { title: "Save video", defaultPath, filters: [{ name: "MP4 video", extensions: ["mp4"] }] };
    const result = win
      ? await withOverlayRelaxed(win, () => dialog.showSaveDialog(win, options))
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    const outputPath = path.extname(result.filePath) ? result.filePath : `${result.filePath}.mp4`;
    await patchSettings({ exportDirectory: path.dirname(outputPath) });
    return outputPath;
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

  ipcMain.handle("shell:showItem", (event, filePath: string) => {
    // Explorer must be visible above the app we are currently overlaying.
    if (isOverlayWindow(BrowserWindow.fromWebContents(event.sender))) hideOverlay();
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("shell:openDefaultApps", () => {
    return shell.openExternal("ms-settings:defaultapps");
  });

  ipcMain.handle("export:start", (_event, request: ExportRequest) => {
    if (isVaultPath(request.sourcePath)) {
      throw new Error("Vault clips stay inside the vault");
    }
    return startExport(request, {
      progress: (payload) => send("export:progress", payload),
      done: (payload) => send("export:done", payload),
      error: (payload) => send("export:error", payload),
    });
  });

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
  ipcMain.on("overlay:show", () => openOverlay());
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
  ipcMain.handle("vault:shortcut", async (_event, accelerator: string) => {
    await saveVaultShortcut(accelerator);
    return getSettings();
  });
  ipcMain.handle("vault:status", () => vaultStatus());
  ipcMain.handle("vault:create", (_event, password: string) => vaultCreate(password));
  ipcMain.handle("vault:unlock", (_event, password: string) => vaultUnlock(password));
  ipcMain.handle("vault:list", () => vaultList());
  ipcMain.handle("vault:add", async (event, move: boolean) => {
    const win = caller(event) ?? getWindow();
    const picked = await withOverlayRelaxed(win, async () => {
      const result = win
        ? await dialog.showOpenDialog(win, { filters, properties: ["openFile"] })
        : await dialog.showOpenDialog({ filters, properties: ["openFile"] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    if (!picked) return vaultList();
    const before = new Set(vaultList().map((item) => item.id));
    const items = await vaultAdd(picked, false);
    const added = items.find((item) => !before.has(item.id));
    if (added) await rememberPoster(picked, added.id);
    if (move === true) {
      try {
        await fs.unlink(picked);
      } catch {
        throw new Error("Saved in the vault. The original file is still on disk.");
      }
    }
    return vaultList();
  });
  ipcMain.handle("vault:poster", async (_event, id: string) => {
    if (!/^[a-f0-9]{32}$/.test(id)) return null;
    const cached = await vaultReadPoster(id);
    if (cached) return cached;
    const session = vaultCopyKey();
    if (!session) return null;
    const plain = path.join(tmpdir(), `lumen-plain-${id}`);
    try {
      await vaultDecryptOutside(id, plain, session);
      return await rememberPoster(plain, id);
    } catch (error) {
      console.error("vault poster failed", error);
      return null;
    } finally {
      session.fill(0);
      await fs.rm(plain, { force: true });
    }
  });
  ipcMain.handle("vault:remove", (_event, id: string) => vaultRemove(id));
  ipcMain.handle("vault:open", (_event, id: string) => vaultMaterialize(id));
  ipcMain.handle("vault:lock", () => vaultLock());
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
