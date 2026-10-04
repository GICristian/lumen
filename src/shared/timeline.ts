/** Magnetic anchors are measured in screen pixels, independent of clip duration. */
export function snapTimelineTime(time: number, duration: number, width: number, anchors: number[], radius = 6): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(width) || width <= 0) return 0;
  const clamped = Math.max(0, Math.min(duration, time));
  const nearest = anchors.filter((anchor) => Number.isFinite(anchor) && anchor >= 0 && anchor <= duration)
    .reduce((best, anchor) => Math.abs(anchor - clamped) < Math.abs(best - clamped) ? anchor : best, Infinity);
  return Math.abs(nearest - clamped) / duration * width <= radius ? nearest : clamped;
}
