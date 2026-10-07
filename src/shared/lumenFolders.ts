export type LumenFolder = {
  name: string;
  directory: string;
  savedAt: number;
  iconPath: string | null;
};

export type FolderRecency = "newest" | "recent" | "older";

export function folderRecency(index: number): FolderRecency {
  if (index <= 0) return "newest";
  if (index === 1) return "recent";
  return "older";
}

export function sortLumenFolders(folders: readonly LumenFolder[]): LumenFolder[] {
  return [...folders].sort((left, right) => right.savedAt - left.savedAt || left.name.localeCompare(right.name));
}

export function filterLumenFolders(folders: readonly LumenFolder[], query: string): LumenFolder[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...folders];
  return folders.filter((folder) => folder.name.toLowerCase().includes(needle));
}
