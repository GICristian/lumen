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
};

export function buildExportArgs(request: ExportArgsInput): string[] {
  const encode = request.precise || request.crop !== null;
  const args = ["-y"];
  if (request.start !== null && request.end !== null) {
    args.push("-ss", String(request.start), "-to", String(request.end));
  }
  args.push("-i", request.input, "-map", "0:v");
  if (request.hasAudio) args.push("-map", "0:a?");
  if (request.crop) {
    const { w, h, x, y } = request.crop;
    args.push("-vf", `crop=${w}:${h}:${x}:${y}`);
  }
  if (!encode) {
    args.push("-c", "copy", "-avoid_negative_ts", "make_zero");
  } else {
    args.push("-c:v", "libx264", "-preset", "veryfast");
    const bitrate = request.videoBitrateKbps;
    if (bitrate && bitrate > 0) args.push("-b:v", `${Math.round(bitrate)}k`);
    else args.push("-crf", "18");
    if (request.hasAudio) args.push("-c:a", "aac", "-b:a", "192k");
    args.push("-movflags", "+faststart");
  }
  args.push("-progress", "pipe:1", request.output);
  return args;
}
