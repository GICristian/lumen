import { promises as fs } from "node:fs";
import path from "node:path";
import type { Settings } from "@shared/contracts";
import { defaultCueStyle, normalizeCueStyle } from "@shared/cues";
import { rememberFolder } from "@shared/folders";
import {
  overlayAccelerator,
  replayAccelerator,
  screenshotAccelerator,
  soundboardAccelerator,
  vaultAccelerator,
} from "@shared/shortcut";
import { normalizeSavedThemes, normalizeTheme, presetDraft } from "@shared/theme";
import {
  replayBuffer, replayFps, replayHeight, replayGain, replayBitrate,
  replayDevice, replayDisplay, replayMicLabel,
} from "@shared/replay";
import { perfOpacityOf, perfScaleOf } from "@shared/perf";
import { clickerButton, clickerInterval, clickerToggleVk } from "@shared/clicker";
import { clampVolume } from "@shared/volume";

export const defaultSettings: Settings = {
  volume: 1,
  loop: false,
  preciseTrim: false,
  folderOpen: false,
  libraryPinned: false,
  windowBounds: null,
  windowMaximized: true,
  lastFolder: null,
  recentFolders: [],
  overlayAccelerator: "Ctrl+Alt+L",
  vaultAccelerator: "Ctrl+Alt+Shift+V",
  launchOnStartup: false,
  overlayBounds: null,
  cueStyle: { ...defaultCueStyle },
  subtitleLanguage: "rum",
  exportDirectory: null,
  cursorSize: 24,
  replaySeconds: 60,
  replayAutoStart: true,
  replayFps: 30,
  replayHeight: 1080,
  replayMic: true,
  replayMicDeviceId: "",
  replayMicLabel: "",
  replayMicGain: 1,
  replaySystemAudio: true,
  replaySystemGain: 1,
  replayNoiseSuppression: true,
  replayEchoCancellation: false,
  replayMicHum: true,
  replayBitrateKbps: 8000,
  replayAccelerator: "Ctrl+Alt+Shift+R",
  replayDirectory: null,
  replayDisplayId: "",
  screenshotAccelerator: "Ctrl+Shift+S",
  soundboardEnabled: false,
  soundboardAccelerator: "F8",
  soundboardVolume: 0.85,
  soundboardMonitor: true,
  soundboardDiscord: false,
  soundboardMic: false,
  soundboardDiscordDeviceId: "",
  macroEnabled: false,
  macroLive: false,
  macroPowerKind: "none",
  macroPowerVk: 0,
  macroPowerMouse: "",
  macroPowerName: "",
  perfEnabled: false,
  perfBounds: null,
  perfScale: 1,
  perfOpacity: 0.92,
  clickerEnabled: false,
  clickerButton: "left",
  clickerIntervalMs: 50,
  clickerToggleVk: 117,
  clickerToggleName: "F6",
  ...presetDraft("gold"),
  savedThemes: [],
  activeSavedId: null,
  previewAudio: false,
};

function overlayBoundsOk(value: unknown): value is NonNullable<Settings["overlayBounds"]> {
  if (!value || typeof value !== "object") return false;
  const box = value as NonNullable<Settings["overlayBounds"]>;
  return [box.x, box.y, box.width, box.height].every((n) => Number.isFinite(n)) &&
    box.width >= 640 &&
    box.width <= 8000 &&
    box.height >= 420 &&
    box.height <= 8000;
}

function perfBoundsOk(value: unknown): value is NonNullable<Settings["perfBounds"]> {
  if (!value || typeof value !== "object") return false;
  const box = value as NonNullable<Settings["perfBounds"]>;
  return Number.isFinite(box.x) && Number.isFinite(box.y) &&
    box.x >= -32000 && box.x <= 32000 &&
    box.y >= -32000 && box.y <= 32000;
}

function boundsOk(value: unknown): value is Settings["windowBounds"] & object {
  if (!value || typeof value !== "object") return false;
  const box = value as Settings["windowBounds"];
  if (!box) return false;
  return [box.x, box.y, box.width, box.height].every((n) => Number.isFinite(n)) &&
    box.width >= 960 &&
    box.height >= 600;
}

export function normalizeSettings(raw: Partial<Settings> | null): Settings {
  return {
    volume: clampVolume(typeof raw?.volume === "number" ? raw.volume : 1),
    loop: raw?.loop === true,
    preciseTrim: raw?.preciseTrim === true,
    folderOpen: raw?.folderOpen === true,
    libraryPinned: raw?.libraryPinned === true,
    windowBounds: boundsOk(raw?.windowBounds) ? raw.windowBounds : null,
    windowMaximized: raw?.windowMaximized !== false,
    lastFolder:
      typeof raw?.lastFolder === "string" && raw.lastFolder.trim() ? raw.lastFolder : null,
    recentFolders: rememberFolder(
      Array.isArray(raw?.recentFolders)
        ? raw.recentFolders.filter((item): item is string => typeof item === "string")
        : [],
      typeof raw?.lastFolder === "string" ? raw.lastFolder : "",
    ),
    overlayAccelerator: overlayAccelerator(raw?.overlayAccelerator),
    vaultAccelerator: vaultAccelerator(raw?.vaultAccelerator),
    launchOnStartup: raw?.launchOnStartup === true,
    overlayBounds: overlayBoundsOk(raw?.overlayBounds) ? raw.overlayBounds : null,
    cueStyle: normalizeCueStyle(raw?.cueStyle),
    subtitleLanguage: raw?.subtitleLanguage === "eng" ? "eng" : "rum",
    exportDirectory: typeof raw?.exportDirectory === "string" && raw.exportDirectory.trim()
      ? raw.exportDirectory
      : null,
    cursorSize: Math.max(16, Math.min(40, Math.round(Number(raw?.cursorSize) || 24))),
    replaySeconds: replayBuffer(raw?.replaySeconds),
    replayAutoStart: raw?.replayAutoStart !== false,
    replayFps: replayFps(raw?.replayFps),
    replayHeight: replayHeight(raw?.replayHeight),
    replayMic: raw?.replayMic !== false,
    replayMicDeviceId: replayDevice(raw?.replayMicDeviceId),
    replayMicLabel: replayMicLabel(raw?.replayMicLabel),
    replayMicGain: replayGain(raw?.replayMicGain),
    replaySystemAudio: raw?.replaySystemAudio !== false,
    replaySystemGain: replayGain(raw?.replaySystemGain),
    replayNoiseSuppression: raw?.replayMicHum === undefined
      ? true
      : raw?.replayNoiseSuppression === true,
    replayEchoCancellation: raw?.replayEchoCancellation === true,
    replayMicHum: raw?.replayMicHum !== false,
    replayBitrateKbps: replayBitrate(raw?.replayBitrateKbps),
    replayAccelerator: replayAccelerator(raw?.replayAccelerator),
    replayDirectory: typeof raw?.replayDirectory === "string" && raw.replayDirectory.trim()
      ? raw.replayDirectory
      : null,
    replayDisplayId: replayDisplay(raw?.replayDisplayId),
    screenshotAccelerator: screenshotAccelerator(raw?.screenshotAccelerator),
    soundboardEnabled: raw?.soundboardEnabled === true,
    soundboardAccelerator: soundboardAccelerator(raw?.soundboardAccelerator),
    soundboardVolume: clampVolume(
      typeof raw?.soundboardVolume === "number" ? raw.soundboardVolume : 0.85,
    ),
    soundboardMonitor: raw?.soundboardMonitor !== false,
    soundboardDiscord: false,
    soundboardMic: false,
    soundboardDiscordDeviceId: typeof raw?.soundboardDiscordDeviceId === "string"
      ? raw.soundboardDiscordDeviceId.slice(0, 256)
      : "",
    macroEnabled: raw?.macroEnabled === true,
    macroLive: raw?.macroLive === true && raw?.macroEnabled === true,
    macroPowerKind: raw?.macroPowerKind === "key" || raw?.macroPowerKind === "mouse"
      ? raw.macroPowerKind
      : "none",
    macroPowerVk: typeof raw?.macroPowerVk === "number" && Number.isFinite(raw.macroPowerVk)
      ? Math.max(0, Math.round(raw.macroPowerVk))
      : 0,
    macroPowerMouse: typeof raw?.macroPowerMouse === "string" ? raw.macroPowerMouse.slice(0, 16) : "",
    macroPowerName: typeof raw?.macroPowerName === "string" ? raw.macroPowerName.slice(0, 24) : "",
    perfEnabled: raw?.perfEnabled === true,
    perfBounds: perfBoundsOk(raw?.perfBounds) ? raw.perfBounds : null,
    perfScale: perfScaleOf(raw?.perfScale),
    perfOpacity: perfOpacityOf(raw?.perfOpacity),
    clickerEnabled: raw?.clickerEnabled === true,
    clickerButton: clickerButton(raw?.clickerButton),
    clickerIntervalMs: clickerInterval(raw?.clickerIntervalMs),
    clickerToggleVk: clickerToggleVk(raw?.clickerToggleVk),
    clickerToggleName: typeof raw?.clickerToggleName === "string"
      ? raw.clickerToggleName.slice(0, 24)
      : "F6",
    ...themeBundle(raw),
  };
}

function themeBundle(raw: Partial<Settings> | null): Pick<
  Settings,
  | "themeId"
  | "themeMode"
  | "themeMotif"
  | "themeBackground"
  | "themeSurface"
  | "themeAccent"
  | "themeAccent2"
  | "savedThemes"
  | "activeSavedId"
  | "previewAudio"
> {
  const theme = normalizeTheme(raw);
  const savedThemes = normalizeSavedThemes(raw?.savedThemes);
  const requested = typeof raw?.activeSavedId === "string" ? raw.activeSavedId : null;
  const known = savedThemes.some((item) => item.id === requested);
  const activeSavedId = theme.themeId === "custom" && known ? requested : null;
  return {
    ...theme,
    savedThemes,
    activeSavedId,
    previewAudio: raw?.previewAudio === true,
  };
}

async function parseSettings(filePath: string): Promise<Settings | null> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    if (!text.trim()) return null;
    return normalizeSettings(JSON.parse(text) as Partial<Settings>);
  } catch {
    return null;
  }
}

export async function readSettings(filePath: string): Promise<Settings> {
  const saved = await parseSettings(filePath);
  if (saved) return saved;
  const backup = await parseSettings(`${filePath}.bak`);
  if (!backup) return { ...defaultSettings };
  try {
    await writeSettings(filePath, backup);
  } catch (error) {
    console.error("settings restore failed", filePath, error);
  }
  return backup;
}

/** Replaces the file only after the new copy is complete, and keeps the previous one. */
export async function writeSettings(filePath: string, settings: Settings): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = JSON.stringify(settings, null, 2);
  const temporary = `${filePath}.tmp`;
  const backup = `${filePath}.bak`;
  await fs.writeFile(temporary, body);
  try {
    await fs.copyFile(filePath, backup);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
  await fs.rm(filePath, { force: true });
  await fs.rename(temporary, filePath);
  await fs.copyFile(filePath, backup);
}

let current = { ...defaultSettings };
let settingsFile = "";
let writing: Promise<void> = Promise.resolve();

export async function initSettings(userData: string): Promise<Settings> {
  settingsFile = path.join(userData, "settings.json");
  current = await readSettings(settingsFile);
  return current;
}

export function getSettings(): Settings {
  return current;
}

let onSettings = (_settings: Settings): void => undefined;

export function watchSettings(listener: (settings: Settings) => void): void {
  onSettings = listener;
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  current = normalizeSettings({ ...current, ...patch });
  const snapshot = current;
  const file = settingsFile;
  const job = writing.catch(() => undefined).then(async () => {
    if (!file) return;
    await writeSettings(file, snapshot);
  });
  writing = job;
  try {
    await job;
  } catch (error) {
    console.error("settings write failed", file, error);
    throw error;
  }
  onSettings(current);
  return current;
}
