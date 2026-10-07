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

/** Empty follows the cursor. Anything else must be a desktop-capturer screen id. */
export function replayDisplay(value: unknown): string {
  if (typeof value !== "string") return "";
  const id = value.trim();
  return /^screen:\d+:\d+$/.test(id) ? id : "";
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

/** Hardware first. libx264 is the fallback when the GPU encoder is missing. */
export function encodeVideoArgs(encoder: string): string[] {
  if (encoder === "h264_nvenc") {
    return ["-c:v", "h264_nvenc", "-preset", "p1", "-tune", "ll", "-rc", "constqp", "-qp", "23", "-pix_fmt", "yuv420p"];
  }
  if (encoder === "h264_amf") {
    return ["-c:v", "h264_amf", "-quality", "speed", "-rc", "cqp", "-qp_i", "22", "-qp_p", "24"];
  }
  if (encoder === "h264_qsv") {
    return ["-c:v", "h264_qsv", "-preset", "veryfast", "-global_quality", "23"];
  }
  return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"];
}

/**
 * Desktop audio stays on input 0. The microphone is added afterwards, at its own
 * gain, without dividing the song by the input count.
 */
export function buildMixSaveArgs(
  videoList: string,
  micList: string,
  output: string,
  copy: boolean,
  duration?: number,
  encoder = "libx264",
  systemGain = 1,
  micGain = 1,
): string[] {
  const args = [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-max_error_rate", "0", "-y",
    "-f", "concat", "-safe", "0", "-c:a", "libopus", "-i", videoList,
    "-f", "concat", "-safe", "0", "-c:a", "libopus", "-i", micList,
  ];
  if (duration !== undefined && Number.isFinite(duration) && duration > 0) {
    args.push("-t", duration.toFixed(6));
  }
  const system = Math.abs(systemGain - 1) < 0.001
    ? "aresample=48000:async=1:first_pts=0"
    : `aresample=48000:async=1:first_pts=0,volume=${systemGain.toFixed(3)}`;
  const voice = `aresample=48000:async=1:first_pts=0,volume=${micGain.toFixed(3)}`;
  const mix = `[0:a]${system}[sys];[1:a]${voice}[mic];`
    + "[sys][mic]amix=inputs=2:duration=first:normalize=0:dropout_transition=0[aout]";
  args.push("-filter_complex", mix, "-map", "0:v:0", "-map", "[aout]");
  if (copy) args.push("-c:v", "copy");
  else args.push(...encodeVideoArgs(encoder));
  args.push("-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", output);
  return args;
}

function mediaTail(
  copy: boolean, encoder: string, output: string, audioBitrate = "160k", rebase = false,
): string[] {
  const args: string[] = [];
  if (copy) {
    args.push("-c:v", "copy");
    if (rebase) args.push("-bsf:v", "setts=pts=PTS-STARTPTS:dts=DTS-STARTPTS");
  } else {
    args.push(...encodeVideoArgs(encoder));
  }
  args.push("-c:a", "aac", "-b:a", audioBitrate, "-ar", "48000", "-movflags", "+faststart", output);
  return args;
}

const MIC_HUM = [
  "highpass=f=80",
  "bandreject=f=50:width_type=q:w=10",
  "bandreject=f=100:width_type=q:w=10",
].join(",");

function gainFilter(base: string, gain: number): string {
  return Math.abs(gain - 1) < 0.001 ? base : `${base},volume=${gain.toFixed(3)}`;
}

/** Drop the audio that plays before the first frame a player can show. */
function pictureLead(start: number, chain: string): string {
  if (start <= 0.001) return chain;
  return `atrim=start=${start.toFixed(3)},asetpts=PTS-STARTPTS,${chain}`;
}

/**
 * One continuous recording. `start` is how long the sound runs before the first
 * decodable frame. A straight copy writes the buffer as it was recorded.
 * A volume change is the case that has to decode the sound.
 */
export function buildFileSaveArgs(
  input: string,
  output: string,
  copy: boolean,
  duration?: number,
  encoder = "libx264",
  start = 0,
  systemGain = 1,
): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", input];
  if (duration !== undefined && Number.isFinite(duration) && duration > 0) {
    args.push("-t", duration.toFixed(6));
  }
  if (copy && Math.abs(systemGain - 1) < 0.001) {
    args.push("-c", "copy", "-movflags", "+faststart", output);
    return args;
  }
  args.push("-af", gainFilter(pictureLead(start, "aresample=48000"), systemGain));
  args.push(...mediaTail(copy, encoder, output, "256k", true));
  return args;
}

/**
 * Picture file plus the microphone file from the same continuous take.
 * `micLeadMs` > 0 means the microphone file is ahead of the picture.
 * The picture is the recording already encoded. Save copies it and only
 * mixes the microphone into the audio.
 */
export function buildFileMixSaveArgs(
  video: string,
  mic: string,
  output: string,
  copy: boolean,
  duration?: number,
  encoder = "libx264",
  systemGain = 1,
  micGain = 1,
  videoStart = 0,
  micStart = 0,
  micLeadMs = 0,
  micHum = false,
): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", video, "-i", mic];
  if (duration !== undefined && Number.isFinite(duration) && duration > 0) args.push("-t", duration.toFixed(6));
  const shift = Math.max(-80, Math.min(80, micLeadMs));
  const voice: string[] = [];
  if (shift > 1) voice.push(`adelay=${Math.round(shift)}|${Math.round(shift)}`);
  if (shift < -1) voice.push(`atrim=start=${(-shift / 1000).toFixed(3)}`, "asetpts=PTS-STARTPTS");
  voice.push("aresample=48000");
  if (micHum) voice.push(MIC_HUM);
  const system = gainFilter(pictureLead(videoStart, "aresample=48000"), systemGain);
  const micChain = gainFilter(pictureLead(micStart, voice.join(",")), micGain);
  const mix = `[0:a]${system}[sys];[1:a]${micChain}[mic];`
    + "[sys][mic]amix=inputs=2:duration=first:normalize=0:dropout_transition=0[aout]";
  args.push("-filter_complex", mix, "-map", "0:v:0", "-map", "[aout]");
  args.push(...mediaTail(copy, encoder, output, "256k", true));
  return args;
}

/** Join finished segments. Copy first; the caller retries with a re-encode if the codecs refuse. */
export function buildSaveArgs(
  listPath: string,
  output: string,
  copy: boolean,
  duration?: number,
  encoder = "libx264",
): string[] {
  const args = [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-max_error_rate", "0", "-y",
    "-f", "concat", "-safe", "0", "-c:a", "libopus", "-i", listPath,
  ];
  if (duration !== undefined && Number.isFinite(duration) && duration > 0) args.push("-t", duration.toFixed(6));
  // Independent recorder segments can overlap or leave small gaps in audio PTS.
  // Reconcile those discontinuities in samples, without stretching voice/pitch.
  args.push("-af", "aresample=48000:async=1:first_pts=0", "-ar", "48000");
  if (copy) args.push("-c:v", "copy");
  else args.push(...encodeVideoArgs(encoder));
  args.push("-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output);
  return args;
}
