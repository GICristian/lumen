export function seekStep(duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return Math.max(0.5, duration * 0.05);
}

export function applySeek(
  current: number,
  duration: number,
  direction: -1 | 1,
  step?: number,
): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const amount = step ?? seekStep(duration);
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  const next = current + amount * direction;
  return Math.min(duration, Math.max(0, next));
}
