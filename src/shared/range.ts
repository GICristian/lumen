export type Marks = { a: number | null; b: number | null };

const MIN_SPAN = 0.1;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function normalizeRange(
  a: number,
  b: number,
  duration: number,
): { a: number; b: number } {
  if (duration < MIN_SPAN) return { a: 0, b: duration };

  let start = Math.min(a, b);
  let end = Math.max(a, b);
  start = Math.min(duration, Math.max(0, start));
  end = Math.min(duration, Math.max(0, end));

  if (end - start < MIN_SPAN) {
    end = Math.min(duration, start + MIN_SPAN);
    if (end - start < MIN_SPAN) start = Math.max(0, end - MIN_SPAN);
  }

  return { a: round3(start), b: round3(end) };
}

export function dragStart(start: number, end: number, duration: number): { a: number; b: number } {
  if (duration < MIN_SPAN) return { a: 0, b: duration };
  const limit = Math.max(0, end - MIN_SPAN);
  const next = Math.min(limit, Math.max(0, start));
  return { a: round3(next), b: round3(Math.min(duration, Math.max(next, end))) };
}

export function dragEnd(start: number, end: number, duration: number): { a: number; b: number } {
  if (duration < MIN_SPAN) return { a: 0, b: duration };
  const limit = Math.min(duration, start + MIN_SPAN);
  const next = Math.max(limit, Math.min(duration, end));
  return { a: round3(Math.max(0, Math.min(start, next))), b: round3(next) };
}

export function segmentShouldRestart(input: {
  current: number;
  end: number;
  paused: boolean;
  scrubbing: boolean;
  seeking: boolean;
  ended: boolean;
}): boolean {
  if (input.scrubbing || input.seeking) return false;
  if (!Number.isFinite(input.current) || !Number.isFinite(input.end)) return false;
  if (input.paused && !input.ended) return false;
  return input.current >= input.end - 0.05;
}

export function setMark(
  marks: Marks,
  which: "a" | "b",
  time: number,
  duration: number,
): Marks {
  if (!Number.isFinite(duration) || duration <= 0) return marks;
  if (duration < MIN_SPAN) return { a: 0, b: duration };
  if (!Number.isFinite(time)) return marks;

  const clamped = Math.min(duration, Math.max(0, time));
  const next: Marks = {
    a: which === "a" ? clamped : marks.a,
    b: which === "b" ? clamped : marks.b,
  };
  if (next.a === null || next.b === null) return next;
  return normalizeRange(next.a, next.b, duration);
}
