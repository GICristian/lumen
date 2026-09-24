import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  ExportDone,
  ExportError,
  ExportProgress,
  ExportRequest,
  LumenApi,
  Settings,
} from "@shared/contracts";

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => {
    cb(payload);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: LumenApi = {
  initialFile: () => ipcRenderer.invoke("app:initialFile"),
  openFile: () => ipcRenderer.invoke("dialog:open"),
  listFolder: (filePath) => ipcRenderer.invoke("library:list", filePath),
  listDirectory: (folderPath) => ipcRenderer.invoke("library:folder", folderPath),
  openFolder: () => ipcRenderer.invoke("dialog:folder"),
  toggleOverlay: () => ipcRenderer.send("overlay:toggle"),
  hideOverlay: () => ipcRenderer.send("overlay:hide"),
  focusOverlay: () => ipcRenderer.send("overlay:focus"),
  dragOverlay: () => ipcRenderer.send("overlay:drag"),
  setOverlayShortcut: (accelerator) => ipcRenderer.invoke("overlay:shortcut", accelerator),
  setLaunchOnStartup: (enabled) => ipcRenderer.invoke("overlay:startup", enabled),
  onOverlayOpen: (cb) => subscribe<void>("overlay:open", cb),
  prepare: (filePath) => ipcRenderer.invoke("media:prepare", filePath),
  thumbnail: (filePath, duration) => ipcRenderer.invoke("media:thumb", filePath, duration),
  preview: (filePath) => ipcRenderer.invoke("media:preview", filePath),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch: Partial<Settings>) => ipcRenderer.invoke("settings:set", patch),
  showItem: (filePath) => ipcRenderer.invoke("shell:showItem", filePath),
  openDefaultApps: () => ipcRenderer.invoke("shell:openDefaultApps"),
  pathForFile: (file) => webUtils.getPathForFile(file),
  startExport: (request: ExportRequest) => ipcRenderer.invoke("export:start", request),
  cancelExport: (jobId) => ipcRenderer.invoke("export:cancel", jobId),
  setTitle: (title) => ipcRenderer.send("window:title", title),
  onExportProgress: (cb) => subscribe<ExportProgress>("export:progress", cb),
  onExportDone: (cb) => subscribe<ExportDone>("export:done", cb),
  onExportError: (cb) => subscribe<ExportError>("export:error", cb),
  onOpenFile: (cb) => subscribe<string>("lumen:open", cb),
  onPlayerHidden: (cb) => subscribe<void>("player:hidden", cb),
  onFullscreen: (cb) => subscribe<boolean>("window:fullscreen", cb),
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  toggleFullscreen: () => ipcRenderer.send("window:fullscreen"),
};

contextBridge.exposeInMainWorld("lumen", api);
