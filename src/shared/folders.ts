export function rememberFolder(recent: string[], folder: string): string[] {
  const trimmed = folder.trim();
  if (!trimmed) return recent.slice(0, 8);
  return [trimmed, ...recent.filter((item) => item !== trimmed)].slice(0, 8);
}

export function folderLabels(folders: string[]): { path: string; label: string }[] {
  const names = folders.map((folder) => folder.split(/[/\\]/).filter(Boolean).pop() ?? folder);
  return folders.map((folder, index) => {
    const name = names[index] ?? folder;
    const duplicated = names.filter((item) => item === name).length > 1;
    if (!duplicated) return { path: folder, label: name };
    const parts = folder.split(/[/\\]/).filter(Boolean);
    const parent = parts[parts.length - 2];
    return { path: folder, label: parent ? `${parent} / ${name}` : name };
  });
}
