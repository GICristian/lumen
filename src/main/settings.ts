import { promises as fs } from "node:fs";
import path from "node:path";
import type { Settings } from "@shared/contracts";
import { rememberFolder } from "@shared/folders";
import { overlayAccelerator } from "@shared/shortcut";
import { clampVolume } from "@shared/volume";

export const defaultSettings: Settings = {
  volume: 1,
  loop: false,
  preciseTrim: false,
  folderOpen: true,
  windowBounds: null,
  lastFolder: null,
  recentFolders: [],
  overlayAccelerator: "Ctrl+Alt+L",
  launchOnStartup: false,
  overlayBounds: null,
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
    folderOpen: raw?.folderOpen !== false,
    windowBounds: boundsOk(raw?.windowBounds) ? raw.windowBounds : null,
    lastFolder:
      typeof raw?.lastFolder === "string" && raw.lastFolder.trim() ? raw.lastFolder : null,
    recentFolders: rememberFolder(
      Array.isArray(raw?.recentFolders)
        ? raw.recentFolders.filter((item): item is string => typeof item === "string")
        : [],
      typeof raw?.lastFolder === "string" ? raw.lastFolder : "",
    ),
    overlayAccelerator: overlayAccelerator(raw?.overlayAccelerator),
    launchOnStartup: raw?.launchOnStartup === true,
    overlayBounds: overlayBoundsOk(raw?.overlayBounds) ? raw.overlayBounds : null,
  };
}

export async function readSettings(filePath: string): Promise<Settings> {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as Partial<Settings>;
    return normalizeSettings(raw);
  } catch {
    return { ...defaultSettings };
  }
}

export async function writeSettings(filePath: string, settings: Settings): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2));
}

let current = { ...defaultSettings };
let settingsFile = "";

export async function initSettings(userData: string): Promise<Settings> {
  settingsFile = path.join(userData, "settings.json");
  current = await readSettings(settingsFile);
  return current;
}

export function getSettings(): Settings {
  return current;
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  current = normalizeSettings({ ...current, ...patch });
  try {
    await writeSettings(settingsFile, current);
  } catch (error) {
    console.error("settings write failed", settingsFile, error);
    throw error;
  }
  return current;
}
