export type ClipSort = "recent" | "name" | "oldest" | "largest";

export const SIZE_PRESETS = [
  { id: "small", label: "Small", kbps: 2500 },
  { id: "balanced", label: "Balanced", kbps: 8000 },
  { id: "high", label: "High", kbps: 16000 },
] as const;

const AUDIO_KBPS = 192;

export function clipTitle(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name;
  return name.slice(0, dot);
}

export function filterClips<T extends { name: string }>(items: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => item.name.toLowerCase().includes(needle));
}

export function sortClips<T extends { name: string; mtimeMs: number; sizeBytes: number }>(
  items: T[],
  mode: ClipSort,
): T[] {
  const byName = (left: T, right: T): number =>
    left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  return [...items].sort((left, right) => {
    if (mode === "name") return byName(left, right);
    if (mode === "oldest") return left.mtimeMs - right.mtimeMs || byName(left, right);
    if (mode === "largest") return right.sizeBytes - left.sizeBytes || byName(left, right);
    return right.mtimeMs - left.mtimeMs || byName(left, right);
  });
}

export function sourceVideoKbps(
  sourceBytes: number,
  durationSec: number,
  hasAudio: boolean,
): number {
  if (!Number.isFinite(sourceBytes) || sourceBytes <= 0) return 8000;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 8000;
  const total = (sourceBytes * 8) / durationSec / 1000;
  const video = total - (hasAudio ? AUDIO_KBPS : 0);
  return Math.round(Math.min(50000, Math.max(500, video)));
}

export function estimateExportBytes(input: {
  sourceBytes: number;
  durationSec: number;
  spanSec?: number | null;
  videoKbps: number | null;
  hasAudio: boolean;
}): number {
  const span =
    input.spanSec !== undefined && input.spanSec !== null && input.spanSec > 0
      ? input.spanSec
      : input.durationSec;
  if (input.videoKbps === null) {
    if (!Number.isFinite(input.durationSec) || input.durationSec <= 0) {
      return Math.max(0, Math.round(input.sourceBytes));
    }
    const ratio = Math.min(1, Math.max(0, span / input.durationSec));
    return Math.max(0, Math.round(input.sourceBytes * ratio));
  }
  if (!Number.isFinite(span) || span <= 0) return 0;
  const audio = input.hasAudio ? AUDIO_KBPS : 0;
  const bytes = ((input.videoKbps + audio) * 1000 / 8) * span;
  return Math.max(0, Math.round(bytes));
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded.replace(/\.0$/, "")} ${units[unit]}`;
}

export function formatMbps(kbps: number): string {
  const mbps = kbps / 1000;
  const text = mbps >= 10 ? mbps.toFixed(0) : mbps.toFixed(1);
  return `${text} Mbps`;
}

export function formatWhen(mtimeMs: number, now = Date.now()): string {
  if (!Number.isFinite(mtimeMs)) return "";
  const delta = Math.max(0, now - mtimeMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "Just now";
  if (delta < hour) return `${Math.max(1, Math.floor(delta / minute))}m ago`;
  if (delta < day) return `${Math.max(1, Math.floor(delta / hour))}h ago`;
  if (delta < 14 * day) return `${Math.max(1, Math.floor(delta / day))}d ago`;
  return new Date(mtimeMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
