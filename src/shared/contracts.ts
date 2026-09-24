import type { VideoRect } from "./crop";
import type { Probe } from "./probe";

export type Settings = {
  volume: number;
  loop: boolean;
  preciseTrim: boolean;
  folderOpen: boolean;
  windowBounds: { x: number; y: number; width: number; height: number } | null;
  lastFolder: string | null;
  recentFolders: string[];
  overlayAccelerator: string;
  launchOnStartup: boolean;
  overlayBounds: { x: number; y: number; width: number; height: number } | null;
};

export type FolderItem = {
  path: string;
  name: string;
  mtimeMs: number;
  sizeBytes: number;
};

export type FolderListing = {
  folder: string;
  currentPath: string;
  items: FolderItem[];
};

export type ExportRequest = {
  sourcePath: string;
  start: number | null;
  end: number | null;
  duration: number;
  precise: boolean;
  crop: VideoRect | null;
  hasAudio: boolean;
  videoBitrateKbps?: number | null;
};

export type PrepareResult = {
  playablePath: string | null;
  probe: Probe;
  ffmpegOk: boolean;
};

export type ExportProgress = { jobId: string; ratio: number };
export type ExportDone = { jobId: string; outputPath: string };
export type ExportError = { jobId: string; message: string };

export type LumenApi = {
  initialFile: () => Promise<string | null>;
  openFile: () => Promise<string | null>;
  listFolder: (filePath: string) => Promise<FolderListing>;
  listDirectory: (folderPath: string) => Promise<FolderListing>;
  openFolder: () => Promise<string | null>;
  toggleOverlay: () => void;
  hideOverlay: () => void;
  focusOverlay: () => void;
  dragOverlay: () => void;
  setOverlayShortcut: (accelerator: string) => Promise<Settings>;
  setLaunchOnStartup: (enabled: boolean) => Promise<Settings>;
  onOverlayOpen: (cb: () => void) => () => void;
  prepare: (filePath: string) => Promise<PrepareResult>;
  thumbnail: (filePath: string, duration: number | null) => Promise<string | null>;
  preview: (filePath: string) => Promise<string | null>;
  getSettings: () => Promise<Settings>;
  setSettings: (patch: Partial<Settings>) => Promise<Settings>;
  showItem: (filePath: string) => Promise<void>;
  openDefaultApps: () => Promise<void>;
  pathForFile: (file: File) => string;
  startExport: (request: ExportRequest) => Promise<{ jobId: string }>;
  cancelExport: (jobId: string) => Promise<void>;
  setTitle: (title: string) => void;
  onExportProgress: (cb: (payload: ExportProgress) => void) => () => void;
  onExportDone: (cb: (payload: ExportDone) => void) => () => void;
  onExportError: (cb: (payload: ExportError) => void) => () => void;
  onOpenFile: (cb: (filePath: string) => void) => () => void;
  onPlayerHidden: (cb: () => void) => () => void;
  onFullscreen: (cb: (active: boolean) => void) => () => void;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  toggleFullscreen: () => void;
};
