export type CleanupClip = {
  path: string;
  sizeBytes: number;
  mtimeMs: number;
  seenAt: number | null;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Clips nobody has opened for three weeks, oldest first.
 * A clip that was never opened uses the file date.
 */
export function staleClips(
  clips: CleanupClip[],
  now: number,
  unseenMs = 21 * DAY,
): CleanupClip[] {
  return clips
    .filter((clip) => {
      const seen = clip.seenAt ?? clip.mtimeMs;
      return Number.isFinite(seen) && now - seen >= unseenMs;
    })
    .sort((a, b) => (a.seenAt ?? a.mtimeMs) - (b.seenAt ?? b.mtimeMs));
}

export function bytesOf(clips: CleanupClip[]): number {
  return clips.reduce((sum, clip) => sum + Math.max(0, clip.sizeBytes), 0);
}
