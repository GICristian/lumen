import { promises as fs } from "node:fs";
import path from "node:path";
import { BrowserWindow } from "electron";
import { normalizeActivity, pushActivity, type ActivityItem, type ActivityKind } from "@shared/activity";
import { favoriteKey, replacePathPrefix } from "@shared/favorites";

let file = "";
let current: ActivityItem[] = [];

export async function initActivity(userData: string): Promise<void> {
  file = path.join(userData, "activity.json");
  try {
    current = normalizeActivity(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    current = [];
  }
}

function publish(): ActivityItem[] {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("activity:changed", current);
  }
  return [...current];
}

async function write(): Promise<void> {
  if (!file) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(current, null, 2));
}

export function listActivity(): ActivityItem[] {
  return [...current];
}

export async function recordActivity(entry: {
  kind: ActivityKind;
  path: string;
}): Promise<ActivityItem[]> {
  current = pushActivity(current, { ...entry, at: Date.now() });
  await write();
  return publish();
}

export async function retargetActivity(fromFile: string, toFile: string): Promise<void> {
  const fromKey = favoriteKey(fromFile);
  let changed = false;
  current = current.map((item) => {
    if (favoriteKey(item.path) !== fromKey) return item;
    changed = true;
    return { ...item, path: toFile };
  });
  if (!changed) return;
  await write();
  publish();
}

export async function moveActivityFolder(fromDir: string, toDir: string): Promise<void> {
  let changed = false;
  current = current.map((item) => {
    const moved = replacePathPrefix(item.path, fromDir, toDir);
    if (moved === item.path) return item;
    changed = true;
    return { ...item, path: moved };
  });
  if (!changed) return;
  await write();
  publish();
}
