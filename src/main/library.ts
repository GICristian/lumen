import { promises as fs } from "node:fs";
import path from "node:path";
import type { FolderItem, FolderListing } from "@shared/contracts";
import { clipFileName } from "@shared/clips";
import { isVideoName, naturalSort } from "@shared/library";

export type DeleteResult = { deleted: string[]; failed: string[] };

export function videoArg(argv: string[]): string | null {
  for (const arg of argv) {
    const cleaned = arg.trim().replace(/^"(.*)"$/, "$1");
    if (isVideoName(cleaned)) return cleaned;
  }
  return null;
}

async function videosIn(folder: string): Promise<FolderListing["items"]> {
  const dirents = await fs.readdir(folder, { withFileTypes: true });
  const names = naturalSort(
    dirents
      .filter((entry) => entry.isFile() && isVideoName(entry.name))
      .map((entry) => entry.name),
  );
  const listed = await Promise.all(
    names.map(async (name): Promise<FolderItem | null> => {
      const filePath = path.join(folder, name);
      try {
        const info = await fs.stat(filePath);
        return { name, path: filePath, mtimeMs: info.mtimeMs, sizeBytes: info.size };
      } catch (error) {
        console.error("clip stat failed", filePath, error);
        return null;
      }
    }),
  );
  return listed.filter((item): item is FolderItem => item !== null);
}

export async function listDirectory(folderPath: string): Promise<FolderListing> {
  let folder = folderPath;
  try {
    const info = await fs.stat(folderPath);
    if (!info.isDirectory()) folder = path.dirname(folderPath);
  } catch {
    throw new Error("Folder not found");
  }
  return {
    folder,
    currentPath: folder,
    items: await videosIn(folder),
  };
}

export async function deleteVideos(paths: string[]): Promise<DeleteResult> {
  const deleted: string[] = [];
  const failed: string[] = [];
  const unique = [...new Set(paths)];
  for (const filePath of unique) {
    const name = path.basename(filePath);
    if (!isVideoName(name)) {
      failed.push(filePath);
      continue;
    }
    try {
      const info = await fs.stat(filePath);
      if (!info.isFile()) {
        failed.push(filePath);
        continue;
      }
      await fs.rm(filePath);
      deleted.push(filePath);
    } catch (error) {
      console.error("clip delete failed", filePath, error);
      failed.push(filePath);
    }
  }
  return { deleted, failed };
}

export async function renameVideo(filePath: string, nextTitle: string): Promise<FolderItem> {
  const info = await fs.stat(filePath);
  if (!info.isFile()) throw new Error("File not found");
  const currentName = path.basename(filePath);
  if (!isVideoName(currentName)) throw new Error("That file is not a clip");
  const nextName = clipFileName(currentName, nextTitle);
  if (!nextName || !isVideoName(nextName)) {
    throw new Error("Use a clip name without special characters");
  }
  const folder = path.dirname(path.resolve(filePath));
  const target = path.join(folder, nextName);
  if (path.resolve(target) === path.resolve(filePath)) {
    return { name: currentName, path: filePath, mtimeMs: info.mtimeMs, sizeBytes: info.size };
  }
  const sameFile = nextName.toLowerCase() === currentName.toLowerCase();
  let occupied = false;
  try {
    await fs.access(target);
    occupied = true;
  } catch {
    occupied = false;
  }
  if (occupied && !sameFile) throw new Error("A clip with that name already exists");
  try {
    if (sameFile) {
      const stamp = Date.now();
      const temporary = path.join(folder, `.lumen-rename-${stamp}${path.extname(currentName)}`);
      await fs.rename(filePath, temporary);
      await fs.rename(temporary, target);
    } else {
      await fs.rename(filePath, target);
    }
  } catch (error) {
    console.error("clip rename failed", filePath, error);
    throw new Error("Clip could not be renamed");
  }
  const next = await fs.stat(target);
  return { name: nextName, path: target, mtimeMs: next.mtimeMs, sizeBytes: next.size };
}

export async function listFolder(filePath: string): Promise<FolderListing> {
  try {
    await fs.stat(filePath);
  } catch {
    throw new Error("File not found");
  }
  const listing = await listDirectory(path.dirname(filePath));
  return { ...listing, currentPath: filePath };
}
