import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { displayAppName } from "@shared/appTitle";
import { isDesktopApp, isGameCapture } from "@shared/captureFolder";
import { sortLumenFolders, type LumenFolder } from "@shared/lumenFolders";
import { moveActivityFolder, retargetActivity } from "./activity";
import { moveFavoriteFolder, retargetFavorite } from "./favorites";
import { productName } from "./productName";
import { getSettings } from "./settings";

type StoredFolder = {
  name: string;
  directory: string;
  imagePath: string | null;
  savedAt: number;
  iconPath: string | null;
};

let file = "";
let iconDir = "";
let stored: StoredFolder[] = [];

const productCache = new Map<string, string | null>();

function cachedProduct(imagePath: string): string | null {
  const key = imagePath.toLowerCase();
  if (productCache.has(key)) return productCache.get(key) ?? null;
  const value = productName(imagePath);
  productCache.set(key, value);
  return value;
}

export function lumenReplayRoot(): string {
  return replayRoot();
}

function replayRoot(): string {
  const chosen = getSettings().replayDirectory;
  if (chosen) return chosen;
  try {
    return path.join(app.getPath("videos"), "Lumen");
  } catch {
    return "";
  }
}

export async function initLumenFolders(userData: string): Promise<void> {
  file = path.join(userData, "lumen-folders.json");
  iconDir = path.join(userData, "app-icons");
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as unknown;
    stored = Array.isArray(raw) ? raw.flatMap(readStored) : [];
  } catch {
    stored = [];
  }
}

function readStored(value: unknown): StoredFolder[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Partial<StoredFolder>;
  if (typeof row.name !== "string" || typeof row.directory !== "string") return [];
  if (typeof row.savedAt !== "number" || !Number.isFinite(row.savedAt)) return [];
  return [{
    name: row.name,
    directory: row.directory,
    imagePath: typeof row.imagePath === "string" ? row.imagePath : null,
    savedAt: row.savedAt,
    iconPath: typeof row.iconPath === "string" ? row.iconPath : null,
  }];
}

function publish(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("lumen-folders:changed");
  }
}

async function write(): Promise<void> {
  if (!file) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(stored, null, 2));
}

async function iconFor(imagePath: string | null): Promise<string | null> {
  if (!imagePath || typeof app.getFileIcon !== "function") return null;
  const name = createHash("sha1").update(imagePath.toLowerCase()).digest("hex").slice(0, 16);
  const target = path.join(iconDir, `${name}.png`);
  try {
    await fs.access(target);
    return target;
  } catch {
    // The icon is extracted once and reused.
  }
  try {
    const image = await app.getFileIcon(imagePath, { size: "normal" });
    const png = image.toPNG();
    if (!png.length) return null;
    await fs.mkdir(iconDir, { recursive: true });
    await fs.writeFile(target, png);
    return target;
  } catch (error) {
    console.error("app icon", imagePath, error);
    return null;
  }
}

export async function rememberLumenFolder(entry: {
  name: string;
  directory: string;
  imagePath: string | null;
  savedAt: number;
}): Promise<void> {
  const key = entry.directory.toLowerCase();
  const previous = stored.find((item) => item.directory.toLowerCase() === key);
  const iconPath = entry.imagePath
    ? await iconFor(entry.imagePath)
    : previous?.iconPath ?? null;
  const next: StoredFolder = {
    name: entry.name,
    directory: entry.directory,
    imagePath: entry.imagePath ?? previous?.imagePath ?? null,
    savedAt: entry.savedAt,
    iconPath,
  };
  stored = [next, ...stored.filter((item) => item.directory.toLowerCase() !== key)];
  await write();
  publish();
}

async function freeTarget(directory: string, name: string): Promise<string> {
  const parsed = path.parse(name);
  let target = path.join(directory, name);
  for (let index = 2; index < 10000; index += 1) {
    try {
      await fs.access(target);
    } catch {
      return target;
    }
    target = path.join(directory, `${parsed.name}_${index}${parsed.ext}`);
  }
  return target;
}

function shouldFold(item: StoredFolder, rootDir: string): boolean {
  if (path.dirname(item.directory).toLowerCase() !== rootDir.toLowerCase()) return false;
  const base = path.basename(item.directory);
  const key = base.toLowerCase();
  if (key === "desktop" || key === "edits") return false;
  if (item.imagePath) {
    const exe = path.basename(item.imagePath).replace(/\.exe$/i, "");
    return !isGameCapture(exe, item.imagePath);
  }
  return isDesktopApp(base);
}

async function foldAppFolder(item: StoredFolder, rootDir: string): Promise<boolean> {
  if (!shouldFold(item, rootDir)) return false;
  const desktop = path.join(rootDir, "Desktop");
  await fs.mkdir(desktop, { recursive: true });
  let names: string[] = [];
  try {
    names = await fs.readdir(item.directory);
  } catch (error) {
    console.error("read app folder", item.directory, error);
    return false;
  }
  for (const name of names) {
    const from = path.join(item.directory, name);
    const target = await freeTarget(desktop, name);
    try {
      await fs.rename(from, target);
    } catch (error) {
      console.error("move replay", from, error);
      return false;
    }
    await retargetFavorite(from, target);
    await retargetActivity(from, target);
  }
  try {
    await fs.rmdir(item.directory);
  } catch (error) {
    console.error("remove app folder", item.directory, error);
    return false;
  }
  return true;
}

async function adoptTitle(item: StoredFolder, rootDir: string): Promise<boolean> {
  if (!item.imagePath) return false;
  if (path.dirname(item.directory).toLowerCase() !== rootDir.toLowerCase()) return false;
  const exe = path.basename(item.imagePath).replace(/\.exe$/i, "");
  const display = displayAppName(exe, item.imagePath, cachedProduct(item.imagePath));
  if (!display || display === path.basename(item.directory)) {
    if (!display || display === item.name) return false;
    item.name = display;
    return true;
  }
  const target = path.join(rootDir, display);
  try {
    await fs.access(target);
    return false;
  } catch {
    // The friendly name is free, so the cryptic folder can move.
  }
  const previous = item.directory;
  try {
    await fs.rename(previous, target);
  } catch (error) {
    console.error("rename replay folder", previous, error);
    return false;
  }
  await moveFavoriteFolder(previous, target);
  await moveActivityFolder(previous, target);
  item.directory = target;
  item.name = display;
  return true;
}

export async function listLumenFolders(): Promise<LumenFolder[]> {
  const byDir = new Map<string, StoredFolder>();
  for (const item of stored) byDir.set(item.directory.toLowerCase(), item);
  const rootDir = replayRoot();
  if (rootDir) {
    try {
      const names = await fs.readdir(rootDir, { withFileTypes: true });
      let newestFile = 0;
      for (const entry of names) {
        const directory = path.join(rootDir, entry.name);
        if (!entry.isDirectory()) {
          const stat = await fs.stat(directory);
          if (stat.mtimeMs > newestFile) newestFile = stat.mtimeMs;
          continue;
        }
        const key = directory.toLowerCase();
        if (byDir.has(key)) continue;
        const stat = await fs.stat(directory);
        byDir.set(key, {
          name: entry.name,
          directory,
          imagePath: null,
          savedAt: stat.mtimeMs,
          iconPath: null,
        });
      }
      const rootKey = rootDir.toLowerCase();
      if (newestFile > 0 && !byDir.has(rootKey)) {
        byDir.set(rootKey, {
          name: path.basename(rootDir) || "Lumen",
          directory: rootDir,
          imagePath: null,
          savedAt: newestFile,
          iconPath: null,
        });
      }
    } catch (error) {
      console.error("lumen folders", rootDir, error);
    }
  }
  const items = [...byDir.values()];
  const kept: StoredFolder[] = [];
  let changed = false;
  let desktopSaved = 0;
  if (rootDir) {
    for (const item of items) {
      if (await foldAppFolder(item, rootDir)) {
        changed = true;
        desktopSaved = Math.max(desktopSaved, item.savedAt);
        continue;
      }
      if (await adoptTitle(item, rootDir)) changed = true;
      kept.push(item);
    }
    if (desktopSaved > 0) {
      const directory = path.join(rootDir, "Desktop");
      const existing = kept.find((item) =>
        item.directory.toLowerCase() === directory.toLowerCase());
      if (existing) existing.savedAt = Math.max(existing.savedAt, desktopSaved);
      else {
        kept.push({
          name: "Desktop",
          directory,
          imagePath: null,
          savedAt: desktopSaved,
          iconPath: null,
        });
      }
    }
  } else {
    kept.push(...items);
  }
  stored = kept;
  if (changed) await write();
  return sortLumenFolders(stored.map((item) => ({
    name: item.name,
    directory: item.directory,
    savedAt: item.savedAt,
    iconPath: item.iconPath,
  })));
}
