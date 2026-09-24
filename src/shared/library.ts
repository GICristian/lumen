export const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "webm", "m4v", "avi"] as const;

const extensionSet = new Set<string>(VIDEO_EXTENSIONS);

export function isVideoName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return false;
  return extensionSet.has(name.slice(dot + 1).toLowerCase());
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function naturalSort(names: string[]): string[] {
  return [...names].sort((left, right) => collator.compare(left, right));
}

export type SiblingMove = { index: number } | { edge: "first" | "last" };

export function siblingIndex(
  length: number,
  current: number,
  direction: -1 | 1,
): SiblingMove {
  if (direction < 0 && current <= 0) return { edge: "first" };
  if (direction > 0 && current >= length - 1) return { edge: "last" };
  return { index: current + direction };
}
