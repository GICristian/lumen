export type Probe = {
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

export function parseProbe(stderr: string): Probe {
  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = durationMatch
    ? Number(durationMatch[1]) * 3600 +
      Number(durationMatch[2]) * 60 +
      Number(durationMatch[3])
    : null;

  let videoCodec: string | null = null;
  let audioCodec: string | null = null;
  let width: number | null = null;
  let height: number | null = null;

  for (const line of stderr.split(/\r?\n/)) {
    const stream = line.match(
      /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: (Video|Audio): ([A-Za-z0-9]+)/,
    );
    if (!stream) continue;
    const kind = stream[1];
    const codec = stream[2].toLowerCase();
    if (kind === "Video" && videoCodec === null) {
      videoCodec = codec;
      const size = line.match(/(\d{2,5})x(\d{2,5})/);
      if (size) {
        width = Number(size[1]);
        height = Number(size[2]);
      }
    }
    if (kind === "Audio" && audioCodec === null) audioCodec = codec;
  }

  return { videoCodec, audioCodec, width, height, duration };
}

export type PlaybackKind = "direct" | "remux" | "unplayable";

const directExtensions = new Set(["mp4", "mov", "webm", "m4v"]);

const undecodable = new Set(["av1", "av01"]);

export function requiresStreamCopy(videoCodec: string | null): boolean {
  return videoCodec !== null && undecodable.has(videoCodec);
}

export function playbackKind(extension: string, probe: Probe): PlaybackKind {
  const ext = extension.toLowerCase().replace(/^\./, "");
  if (directExtensions.has(ext)) return "direct";
  const audioOk =
    probe.audioCodec === null || probe.audioCodec === "aac" || probe.audioCodec === "mp3";
  if ((ext === "mkv" || ext === "avi") && probe.videoCodec === "h264" && audioOk) {
    return "remux";
  }
  return "unplayable";
}

export function progressRatio(outTimeMicroseconds: number, spanSeconds: number): number | null {
  if (!Number.isFinite(spanSeconds) || spanSeconds <= 0) return null;
  if (!Number.isFinite(outTimeMicroseconds) || outTimeMicroseconds < 0) return null;
  const seconds = outTimeMicroseconds / 1_000_000;
  return Math.min(1, Math.max(0, seconds / spanSeconds));
}

export function progressFromChunk(chunk: string, spanSeconds: number): number | null {
  const match = chunk.match(/out_time_ms=(\d+)/);
  if (!match) return null;
  return progressRatio(Number(match[1]), spanSeconds);
}

export function lastStderrLine(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines[lines.length - 1] ?? "Export failed";
}
