export const REPLAY_SEGMENT_SECONDS = 4;
export const REPLAY_BUFFERS = [30, 60, 120, 300] as const;

export type ReplayBuffer = number;
export type ReplayFps = 30 | 60;
export type ReplayHeight = 720 | 1080;

export function replayBuffer(value: unknown): ReplayBuffer {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.max(10, Math.min(900, Math.round(seconds))) : 60;
}

export function replayGain(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1;
}

export function replayBitrate(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(2000, Math.min(30000, Math.round(value / 500) * 500)) : 8000;
}

export function replayDevice(value: unknown): string {
  return typeof value === "string" && value.length <= 512 ? value : "";
}

export function replayBudget(seconds: number, kbps: number): number {
  return Math.ceil((seconds + REPLAY_SEGMENT_SECONDS * 2) * (kbps + 160) * 1000 / 8);
}

export function replayDimensions(sourceWidth: number, sourceHeight: number, targetHeight: number): { width: number; height: number } {
  const sourceW = sourceWidth > 0 ? sourceWidth : 1920;
  const sourceH = sourceHeight > 0 ? sourceHeight : 1080;
  const height = Math.max(2, Math.floor(Math.min(sourceH, targetHeight) / 2) * 2);
  return { width: Math.max(2, Math.round(height * sourceW / sourceH / 2) * 2), height };
}

export function replayTail<T extends { duration: number }>(segments: T[], seconds: number): T[] {
  let total = 0;
  let start = segments.length;
  while (start > 0 && total < seconds) total += segments[--start].duration;
  return segments.slice(start);
}

export function replayFps(value: unknown): ReplayFps {
  return Number(value) === 60 ? 60 : 30;
}

export function replayHeight(value: unknown): ReplayHeight {
  return Number(value) === 720 ? 720 : 1080;
}

/**
 * How many oldest finished segments can be deleted while the buffer still covers the window.
 * The newest segment is still being written, so it is never counted as disposable.
 */
export function segmentsToDrop(
  count: number,
  segmentSeconds: number,
  bufferSeconds: number,
): number {
  if (count <= 1 || segmentSeconds <= 0 || bufferSeconds <= 0) return 0;
  const extra = (count - 1) * segmentSeconds - bufferSeconds;
  if (extra <= 0) return 0;
  return Math.min(count - 1, Math.floor(extra / segmentSeconds));
}

export function concatLine(file: string): string {
  const safe = file.replace(/\\/g, "/").replace(/'/g, "'\\''");
  return `file '${safe}'`;
}

export function replayFileName(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `Replay ${day} ${time}.mp4`;
}

/** A copied segment list can still contain samples Windows will not thumbnail. */
export function pictureBroken(stderr: string): boolean {
  return /Invalid NAL|Decoding error|Invalid data found|Error while decoding/i.test(stderr);
}

/** Join finished segments. Copy first; the caller retries with a re-encode if the codecs refuse. */
export function buildSaveArgs(listPath: string, output: string, copy: boolean, duration?: number): string[] {
  const args = [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-max_error_rate", "0", "-y",
    "-f", "concat", "-safe", "0", "-c:a", "libopus", "-i", listPath,
  ];
  if (duration !== undefined && Number.isFinite(duration) && duration > 0) args.push("-t", duration.toFixed(6));
  // Independent recorder segments can overlap or leave small gaps in audio PTS.
  // Reconcile those discontinuities in samples, without stretching voice/pitch.
  args.push("-af", "aresample=48000:async=1:first_pts=0", "-ar", "48000");
  if (copy) args.push("-c:v", "copy", "-c:a", "aac", "-b:a", "160k");
  else {
    args.push(
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "160k",
    );
  }
  args.push("-movflags", "+faststart", output);
  return args;
}
