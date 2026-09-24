import { promises as fs } from "node:fs";
import path from "node:path";
import type { FolderItem, FolderListing } from "@shared/contracts";
import { isVideoName, naturalSort } from "@shared/library";

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

export async function listFolder(filePath: string): Promise<FolderListing> {
  try {
    await fs.stat(filePath);
  } catch {
    throw new Error("File not found");
  }
  const listing = await listDirectory(path.dirname(filePath));
  return { ...listing, currentPath: filePath };
}
