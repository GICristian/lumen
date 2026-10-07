import type { VideoRect } from "./crop";

export type ExportArgsInput = {
  input: string;
  output: string;
  start: number | null;
  end: number | null;
  precise: boolean;
  crop: VideoRect | null;
  hasAudio: boolean;
  videoBitrateKbps?: number | null;
  /** Playback level from the editor. Omitted or 1 keeps the original audio. */
  volume?: number | null;
};

/** A level other than full volume has to be baked in, so the audio cannot be copied. */
export function exportVolume(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const level = Math.min(1, Math.max(0, value));
  if (Math.abs(level - 1) < 0.001) return null;
  return level;
}

export function buildExportArgs(request: ExportArgsInput): string[] {
  const encode = request.precise || request.crop !== null;
  const level = request.hasAudio ? exportVolume(request.volume) : null;
  const span =
    request.start !== null && request.end !== null && request.end > request.start;
  const args = ["-y"];
  if (!encode && span) {
    args.push("-ss", String(request.start), "-to", String(request.end));
  }
  args.push("-i", request.input);
  if (encode && span) {
    const duration = (request.end ?? 0) - (request.start ?? 0);
    args.push("-ss", String(request.start), "-t", duration.toFixed(3));
  }
  args.push("-map", "0:v");
  if (request.hasAudio) args.push("-map", "0:a?");
  if (request.crop) {
    const { w, h, x, y } = request.crop;
    args.push("-vf", `crop=${w}:${h}:${x}:${y}`);
  }
  if (!encode && level === null) {
    args.push("-c", "copy", "-avoid_negative_ts", "make_zero");
  } else if (!encode && level !== null) {
    args.push("-c:v", "copy", "-avoid_negative_ts", "make_zero");
    args.push("-af", `volume=${level.toFixed(3)}`, "-c:a", "aac", "-b:a", "192k");
  } else {
    args.push("-c:v", "libx264", "-preset", "veryfast");
    const bitrate = request.videoBitrateKbps;
    if (bitrate && bitrate > 0) args.push("-b:v", `${Math.round(bitrate)}k`);
    else args.push("-crf", "18");
    if (request.hasAudio && level !== null) args.push("-af", `volume=${level.toFixed(3)}`);
    if (request.hasAudio) args.push("-c:a", "aac", "-b:a", "192k");
    args.push("-movflags", "+faststart");
  }
  args.push("-progress", "pipe:1", request.output);
  return args;
}
