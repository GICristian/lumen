import { promises as fs } from "node:fs";
import path from "node:path";
import { BrowserWindow } from "electron";
import {
  dropFavorites,
  favoriteKey,
  normalizeFavorites,
  replacePathPrefix,
  toggleFavorite,
} from "@shared/favorites";

let file = "";
let current: string[] = [];

export async function initFavorites(userData: string): Promise<void> {
  file = path.join(userData, "favorites.json");
  try {
    current = normalizeFavorites(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    current = [];
  }
}

async function write(): Promise<void> {
  if (!file) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(current, null, 2));
}

function publish(): string[] {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("favorites:changed", current);
  }
  return [...current];
}

export function listFavorites(): string[] {
  return [...current];
}

export async function toggleFavoritePath(filePath: string): Promise<string[]> {
  if (!filePath.trim()) return listFavorites();
  current = toggleFavorite(current, filePath);
  await write();
  return publish();
}

export async function forgetFavoritePaths(paths: readonly string[]): Promise<string[]> {
  current = dropFavorites(current, paths);
  await write();
  return publish();
}

export async function retargetFavorite(fromFile: string, toFile: string): Promise<void> {
  const fromKey = favoriteKey(fromFile);
  let changed = false;
  const next = current.map((item) => {
    if (favoriteKey(item) !== fromKey) return item;
    changed = true;
    return toFile;
  });
  if (!changed) return;
  current = normalizeFavorites(next);
  await write();
  publish();
}

export async function moveFavoriteFolder(fromDir: string, toDir: string): Promise<void> {
  let changed = false;
  const next = current.map((item) => {
    const moved = replacePathPrefix(item, fromDir, toDir);
    if (moved !== item) changed = true;
    return moved;
  });
  if (!changed) return;
  current = normalizeFavorites(next);
  await write();
  publish();
}
