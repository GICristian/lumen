import type { VideoRect } from "./crop";
import type { SequenceClip } from "./sequence";
import type { CueStyle } from "./cues";
import type { Probe } from "./probe";

export type Settings = {
  volume: number;
  loop: boolean;
  preciseTrim: boolean;
  folderOpen: boolean;
  libraryPinned: boolean;
  windowBounds: { x: number; y: number; width: number; height: number } | null;
  windowMaximized: boolean;
  lastFolder: string | null;
  recentFolders: string[];
  overlayAccelerator: string;
  vaultAccelerator: string;
  launchOnStartup: boolean;
  overlayBounds: { x: number; y: number; width: number; height: number } | null;
  cueStyle: CueStyle;
  subtitleLanguage: "rum" | "eng";
  exportDirectory: string | null;
  cursorSize: number;
  replaySeconds: number;
  replayAutoStart: boolean;
  replayFps: 30 | 60;
  replayHeight: 720 | 1080;
  replayMic: boolean;
  replayMicDeviceId: string;
  replayMicGain: number;
  replaySystemAudio: boolean;
  replaySystemGain: number;
  replayNoiseSuppression: boolean;
  replayEchoCancellation: boolean;
  replayMicHum: boolean;
  replayBitrateKbps: number;
  replayAccelerator: string;
  replayDirectory: string | null;
  /** Desktop-capturer id such as `screen:0:0`. Empty follows the cursor. */
  replayDisplayId: string;
};

export type ReplayScreen = {
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  primary: boolean;
};

export type ReplayStatus = {
  armed: boolean;
  saving: boolean;
  seconds: number;
  autoStart: boolean;
  captureWidth: number;
  captureHeight: number;
  fps: 30 | 60;
  height: 720 | 1080;
  mic: boolean;
  micDeviceId: string;
  micGain: number;
  systemAudio: boolean;
  systemGain: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  micHum: boolean;
  bitrateKbps: number;
  bufferedSeconds: number;
  bufferBytes: number;
  ready: boolean;
  shortcut: string;
  directory: string;
  encoder: string;
  notice: string | null;
  lastFile: string | null;
  displayId: string;
  displays: ReplayScreen[];
};

export type ReplayCaptureOptions = {
  sessionId: string;
  sourceWidth: number;
  sourceHeight: number;
  fps: 30 | 60;
  height: 720 | 1080;
  mic: boolean;
  micDeviceId: string;
  micGain: number;
  systemAudio: boolean;
  systemGain: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  micHum: boolean;
  bitrateKbps: number;
};

export type ReplaySegment = {
  sessionId: string;
  bytes: Uint8Array;
  micBytes?: Uint8Array;
  headerBytes?: Uint8Array;
  micHeaderBytes?: Uint8Array;
  /** Positive when the microphone recording is ahead of the picture, in milliseconds. */
  micLeadMs?: number;
  /** Cluster from a recorder that is still running, not a file that was stopped and started. */
  cluster?: boolean;
  duration: number;
  startedAt: number;
  endedAt: number;
  flushId?: string;
};

export type ReplayCaptureInfo = {
  sessionId: string;
  width: number;
  height: number;
  audio: boolean;
  mic: boolean;
  codec: string;
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
  /** Editor playback level. Omitted or 1 leaves the file's audio unchanged. */
  volume?: number | null;
  outputPath?: string;
};

export type { SequenceClip };

export type PrepareResult = {
  playablePath: string | null;
  probe: Probe;
  ffmpegOk: boolean;
};

export type SubtitleHit = {
  id: string;
  title: string;
  fileName: string;
  language: string;
  downloads: number;
  url: string;
};

export type VaultItem = {
  id: string;
  name: string;
  bytes: number;
};

export type VaultStatus = {
  exists: boolean;
  open: boolean;
};

export type UpdatePhase = "idle" | "available" | "downloading" | "ready" | "error";

export type UpdateState = {
  phase: UpdatePhase;
  version: string | null;
  percent: number;
  dismissed: boolean;
  message: string | null;
};

export type ExportProgress = { jobId: string; ratio: number };
export type ActivityKind = "recorded" | "exported";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  path: string;
  at: number;
};

export type LumenFolder = {
  name: string;
  directory: string;
  savedAt: number;
  iconPath: string | null;
};

export type ExportDone = { jobId: string; outputPath: string };
export type ExportError = { jobId: string; message: string };

export type LumenApi = {
  initialFile: () => Promise<string | null>;
  openFile: () => Promise<string | null>;
  listFolder: (filePath: string) => Promise<FolderListing>;
  listDirectory: (folderPath: string) => Promise<FolderListing>;
  deleteClips: (paths: string[]) => Promise<{ deleted: string[]; failed: string[] }>;
  searchSubtitles: (
    query: string,
    language: string,
  ) => Promise<SubtitleHit[]>;
  fetchSubtitle: (url: string) => Promise<string>;
  openSubtitleFile: () => Promise<string | null>;
  readSubtitle: (filePath: string) => Promise<{ vtt: string; label: string }>;
  syncSubtitles: (
    filePath: string,
    vtt: string,
    duration: number,
  ) => Promise<number>;
  openFolder: () => Promise<string | null>;
  chooseExportPath: (sourcePath: string, suffix: "trim" | "edit") => Promise<string | null>;
  toggleOverlay: () => void;
  openOverlay: () => void;
  hideOverlay: () => void;
  focusOverlay: () => void;
  dragOverlay: () => void;
  setOverlayShortcut: (accelerator: string) => Promise<Settings>;
  setVaultShortcut: (accelerator: string) => Promise<Settings>;
  setLaunchOnStartup: (enabled: boolean) => Promise<Settings>;
  vaultStatus: () => Promise<VaultStatus>;
  vaultCreate: (password: string) => Promise<VaultItem[]>;
  vaultUnlock: (password: string) => Promise<VaultItem[]>;
  vaultList: () => Promise<VaultItem[]>;
  vaultAdd: (move: boolean) => Promise<VaultItem[]>;
  vaultRemove: (id: string) => Promise<VaultItem[]>;
  vaultOpen: (id: string) => Promise<string>;
  vaultPoster: (id: string) => Promise<string | null>;
  vaultLock: () => Promise<void>;
  onVaultOpen: (cb: () => void) => () => void;
  onShowHome: (cb: () => void) => () => void;
  onOverlayOpen: (cb: (file?: string) => void) => () => void;
  prepare: (filePath: string) => Promise<PrepareResult>;
  thumbnail: (filePath: string, duration: number | null) => Promise<string | null>;
  preview: (filePath: string) => Promise<string | null>;
  getSettings: () => Promise<Settings>;
  setSettings: (patch: Partial<Settings>) => Promise<Settings>;
  showItem: (filePath: string) => Promise<void>;
  openDefaultApps: () => Promise<void>;
  pathForFile: (file: File) => string;
  startExport: (request: ExportRequest) => Promise<{ jobId: string }>;
  startSequence: (clips: SequenceClip[]) => Promise<{ jobId: string }>;
  openStudio: (filePath: string) => Promise<void>;
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
  replayStatus: () => Promise<ReplayStatus>;
  replayOpen: () => Promise<void>;
  replayDismiss: () => void;
  overlayPendingFile: () => Promise<string | null>;
  replayArm: (on: boolean) => Promise<ReplayStatus>;
  replaySave: () => Promise<ReplayStatus>;
  replayUpdate: (patch: Partial<Settings>) => Promise<ReplayStatus>;
  replayShortcut: (accelerator: string) => Promise<ReplayStatus>;
  replayFolder: () => Promise<ReplayStatus>;
  onReplayStatus: (cb: (status: ReplayStatus) => void) => () => void;
  onReplayCaptureStart: (cb: (options: ReplayCaptureOptions) => void) => () => void;
  onReplayCaptureStop: (cb: () => void) => () => void;
  onReplayCaptureFlush: (cb: (id: string) => void) => () => void;
  replayCaptureMounted: () => void;
  replaySegment: (segment: ReplaySegment) => Promise<void>;
  replayCaptureReady: (info: ReplayCaptureInfo) => void;
  replayCaptureFailed: (message: string) => void;
  replayRebindAudio: () => Promise<ReplayStatus>;
  favorites: () => Promise<string[]>;
  toggleFavorite: (filePath: string) => Promise<string[]>;
  forgetFavorites: (paths: string[]) => Promise<string[]>;
  onFavorites: (cb: (paths: string[]) => void) => () => void;
  activity: () => Promise<ActivityItem[]>;
  onActivity: (cb: (items: ActivityItem[]) => void) => () => void;
  lumenFolders: () => Promise<LumenFolder[]>;
  onLumenFolders: (cb: () => void) => () => void;
  updateState: () => Promise<UpdateState>;
  installUpdate: () => Promise<void>;
  dismissUpdate: () => Promise<UpdateState>;
  onUpdateState: (cb: (state: UpdateState) => void) => () => void;
  onStudioOpen: (cb: (filePath: string) => void) => () => void;
};
