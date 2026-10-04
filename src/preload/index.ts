import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  ExportDone,
  ExportError,
  ExportProgress,
  ExportRequest,
  LumenApi,
  ReplayCaptureInfo,
  ReplayCaptureOptions,
  ReplayStatus,
  Settings,
  UpdateState,
  SubtitleHit,
  VaultItem,
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
  deleteClips: (paths) => ipcRenderer.invoke("library:delete", paths),
  searchSubtitles: (query, language) =>
    ipcRenderer.invoke("subtitles:search", query, language) as Promise<SubtitleHit[]>,
  fetchSubtitle: (url) => ipcRenderer.invoke("subtitles:fetch", url),
  openSubtitleFile: () => ipcRenderer.invoke("subtitles:file"),
  readSubtitle: (filePath) => ipcRenderer.invoke("subtitles:read", filePath),
  syncSubtitles: (filePath, vtt, duration) =>
    ipcRenderer.invoke("subtitles:sync", filePath, vtt, duration),
  openFolder: () => ipcRenderer.invoke("dialog:folder"),
  chooseExportPath: (sourcePath, suffix) => ipcRenderer.invoke("dialog:export", sourcePath, suffix),
  toggleOverlay: () => ipcRenderer.send("overlay:toggle"),
  openOverlay: () => ipcRenderer.send("overlay:show"),
  hideOverlay: () => ipcRenderer.send("overlay:hide"),
  focusOverlay: () => ipcRenderer.send("overlay:focus"),
  dragOverlay: () => ipcRenderer.send("overlay:drag"),
  setOverlayShortcut: (accelerator) => ipcRenderer.invoke("overlay:shortcut", accelerator),
  setVaultShortcut: (accelerator) => ipcRenderer.invoke("vault:shortcut", accelerator),
  setLaunchOnStartup: (enabled) => ipcRenderer.invoke("overlay:startup", enabled),
  vaultStatus: () => ipcRenderer.invoke("vault:status"),
  vaultCreate: (password) => ipcRenderer.invoke("vault:create", password) as Promise<VaultItem[]>,
  vaultUnlock: (password) => ipcRenderer.invoke("vault:unlock", password) as Promise<VaultItem[]>,
  vaultList: () => ipcRenderer.invoke("vault:list") as Promise<VaultItem[]>,
  vaultAdd: (move) => ipcRenderer.invoke("vault:add", move) as Promise<VaultItem[]>,
  vaultRemove: (id) => ipcRenderer.invoke("vault:remove", id) as Promise<VaultItem[]>,
  vaultOpen: (id) => ipcRenderer.invoke("vault:open", id),
  vaultPoster: (id) => ipcRenderer.invoke("vault:poster", id) as Promise<string | null>,
  vaultLock: () => ipcRenderer.invoke("vault:lock"),
  onVaultOpen: (cb) => subscribe<void>("vault:open", cb),
  onShowHome: (cb) => subscribe<void>("lumen:home", cb),
  onOverlayOpen: (cb) => subscribe<string | undefined>("overlay:open", cb),
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
  replayOpen: () => ipcRenderer.invoke("replay:open"),
  replayDismiss: () => ipcRenderer.send("replay:dismiss"),
  overlayPendingFile: () => ipcRenderer.invoke("overlay:pending-file"),
  replayStatus: () => ipcRenderer.invoke("replay:status") as Promise<ReplayStatus>,
  replayArm: (on) => ipcRenderer.invoke("replay:arm", on) as Promise<ReplayStatus>,
  replaySave: () => ipcRenderer.invoke("replay:save", Date.now()) as Promise<ReplayStatus>,
  replayUpdate: (patch) => ipcRenderer.invoke("replay:update", patch) as Promise<ReplayStatus>,
  replayShortcut: (accelerator) =>
    ipcRenderer.invoke("replay:shortcut", accelerator) as Promise<ReplayStatus>,
  replayFolder: () => ipcRenderer.invoke("replay:folder") as Promise<ReplayStatus>,
  onReplayStatus: (cb) => subscribe<ReplayStatus>("replay:status", cb),
  onReplayCaptureStart: (cb) => subscribe<ReplayCaptureOptions>("replay:capture-start", cb),
  onReplayCaptureStop: (cb) => subscribe<void>("replay:capture-stop", cb),
  onReplayCaptureFlush: (cb) => subscribe<string>("replay:capture-flush", cb),
  replayCaptureMounted: () => ipcRenderer.send("replay:capture-mounted"),
  replaySegment: (segment) => ipcRenderer.invoke("replay:segment", segment),
  replayCaptureReady: (info: ReplayCaptureInfo) => ipcRenderer.send("replay:capture-ready", info),
  replayCaptureFailed: (message) => ipcRenderer.send("replay:capture-failed", message),
  updateState: () => ipcRenderer.invoke("update:state") as Promise<UpdateState>,
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateState: (cb) => subscribe<UpdateState>("update:state", cb),
};

contextBridge.exposeInMainWorld("lumen", api);
