export type ThumbDecoder = "software" | "av1_cuvid";

export type StillAttempt = {
  seek: string;
  accurate: boolean;
  decoder: ThumbDecoder;
  timeoutMs: number;
};

const SOFTWARE_TIMEOUT_MS = 20_000;
const AV1_TIMEOUT_MS = 8_000;
const AV1_SOFTWARE_TIMEOUT_MS = 6_000;

/** True when the file header names an AV1 sample entry or a WebM AV1 track. */
export function bufferLooksLikeAv1(bytes: Uint8Array): boolean {
  const text = new TextDecoder("latin1").decode(bytes);
  return text.includes("av01") || text.includes("V_AV1");
}

/** ffmpeg arguments that write one 480-wide jpeg. The decoder flag stays before the input. */
export function thumbGrabArgs(
  filePath: string,
  output: string,
  seek: string,
  accurate: boolean,
  decoder: ThumbDecoder,
): string[] {
  const args = ["-y"];
  if (decoder === "av1_cuvid") args.push("-c:v", "av1_cuvid");
  if (!accurate) args.push("-ss", seek);
  args.push("-i", filePath);
  if (accurate) args.push("-ss", seek);
  args.push("-frames:v", "1", "-an", "-vf", "scale=480:-2", "-q:v", "4", output);
  return args;
}

/**
 * AV1 stills go through the NVIDIA decoder first. A software decode of these
 * files fails before the sequence header and would hold the thumbnail queue.
 */
export function stillAttempts(
  duration: number | null,
  decoder: ThumbDecoder,
): StillAttempt[] {
  const first = duration !== null && duration < 1 ? "0" : "1";
  if (decoder === "av1_cuvid") {
    const attempts: StillAttempt[] = [
      { seek: first, accurate: false, decoder: "av1_cuvid", timeoutMs: AV1_TIMEOUT_MS },
    ];
    if (first !== "0") {
      attempts.push({
        seek: "0",
        accurate: false,
        decoder: "av1_cuvid",
        timeoutMs: AV1_TIMEOUT_MS,
      });
    }
    attempts.push({
      seek: first,
      accurate: true,
      decoder: "software",
      timeoutMs: AV1_SOFTWARE_TIMEOUT_MS,
    });
    return attempts;
  }
  return [
    { seek: first, accurate: false, decoder: "software", timeoutMs: SOFTWARE_TIMEOUT_MS },
    { seek: "0", accurate: false, decoder: "software", timeoutMs: SOFTWARE_TIMEOUT_MS },
    { seek: first, accurate: true, decoder: "software", timeoutMs: SOFTWARE_TIMEOUT_MS },
  ];
}
