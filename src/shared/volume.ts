export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(1, Math.max(0, volume));
}

export function stepVolume(volume: number, direction: -1 | 1): number {
  const base = clampVolume(volume);
  const stepped = base + 0.05 * direction;
  return clampVolume(Math.round(stepped * 1000) / 1000);
}
