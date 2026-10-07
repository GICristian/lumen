import type { VideoRect } from "./crop";

export type SequenceClip = {
  path: string;
  start: number;
  end: number;
  volume: number;
  crop: VideoRect | null;
  hasAudio: boolean;
  width: number;
  height: number;
  fps: number;
};

function even(value: number): number {
  const next = Math.max(2, Math.round(value));
  return next % 2 === 0 ? next : next - 1;
}

function seconds(value: number): string {
  return Math.max(0, value).toFixed(3);
}

/** The joined picture keeps the largest frame and the higher of 30 or 60. */
export function sequenceFrame(clips: readonly SequenceClip[]): {
  width: number;
  height: number;
  fps: number;
} {
  let width = 2;
  let height = 2;
  let fps = 30;
  for (const clip of clips) {
    width = Math.max(width, clip.crop?.w ?? clip.width);
    height = Math.max(height, clip.crop?.h ?? clip.height);
    if (clip.fps > fps) fps = clip.fps;
  }
  return { width: even(width), height: even(height), fps: fps >= 50 ? 60 : 30 };
}

export function sequenceDuration(clips: readonly SequenceClip[]): number {
  return clips.reduce((total, clip) => total + Math.max(0.01, clip.end - clip.start), 0);
}

/** One encode that trims, crops, sets volume, and joins every clip on the line. */
export function buildSequenceArgs(clips: readonly SequenceClip[], output: string): string[] {
  if (clips.length === 0) throw new Error("Add a clip to the timeline");
  const frame = sequenceFrame(clips);
  const args = ["-y"];
  for (const clip of clips) args.push("-i", clip.path);
  const filters: string[] = [];
  const heads: string[] = [];
  clips.forEach((clip, index) => {
    const start = Math.max(0, clip.start);
    const end = Math.max(start + 0.01, clip.end);
    const video = [
      `[${index}:v]trim=start=${seconds(start)}:end=${seconds(end)}`,
      "setpts=PTS-STARTPTS",
    ];
    if (clip.crop) {
      const { w, h, x, y } = clip.crop;
      video.push(`crop=${w}:${h}:${x}:${y}`);
    }
    video.push(
      `scale=${frame.width}:${frame.height}:force_original_aspect_ratio=decrease`,
      `pad=${frame.width}:${frame.height}:(ow-iw)/2:(oh-ih)/2`,
      "setsar=1",
      `fps=${frame.fps}`,
      `format=yuv420p[v${index}]`,
    );
    filters.push(video.join(","));
    const level = Math.min(1, Math.max(0, clip.volume)).toFixed(3);
    const duration = seconds(end - start);
    const audio = clip.hasAudio
      ? `[${index}:a]atrim=start=${seconds(start)}:end=${seconds(end)},asetpts=PTS-STARTPTS`
      : `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${duration}`;
    const gain = clip.hasAudio ? `,volume=${level}` : "";
    filters.push(`${audio}${gain},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${index}]`);
    heads.push(`[v${index}][a${index}]`);
  });
  filters.push(`${heads.join("")}concat=n=${clips.length}:v=1:a=1[v][a]`);
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    output,
  );
  return args;
}
