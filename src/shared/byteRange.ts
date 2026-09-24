export type ByteSpan = { start: number; end: number };

export type RangePlan =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export function mediaContentType(filePath: string): string {
  const ext = filePath.split(/[/\\.]/).pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export function byteRangePlan(size: number, header: string | null): RangePlan {
  if (!header || size <= 0) return { kind: "full" };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return { kind: "full" };

  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  if (startText === "" && endText === "") return { kind: "full" };

  if (startText === "") {
    const suffix = Number(endText);
    if (!Number.isFinite(suffix) || suffix <= 0) return { kind: "unsatisfiable" };
    const length = Math.min(suffix, size);
    return { kind: "partial", start: size - length, end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText === "" ? size - 1 : Number(endText);
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd)) return { kind: "unsatisfiable" };
  if (start < 0 || start >= size || start > requestedEnd) return { kind: "unsatisfiable" };
  return { kind: "partial", start, end: Math.min(requestedEnd, size - 1) };
}
