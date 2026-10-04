import { srtToVtt } from "./srt";

export type Cue = { start: number; end: number; text: string };

export type CueStyle = {
  size: number;
  color: string;
  backdrop: number;
  outline: number;
  lift: number;
};

export const defaultCueStyle: CueStyle = {
  size: 22,
  color: "#ffffff",
  backdrop: 0.72,
  outline: 2,
  lift: 10,
};

const colors = new Set(["#ffffff", "#ffe56a", "#5ce1ff", "#d7dde8"]);

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, number));
}

export function normalizeCueStyle(value: unknown): CueStyle {
  const raw = value && typeof value === "object" ? (value as Partial<CueStyle>) : {};
  const color = typeof raw.color === "string" && colors.has(raw.color) ? raw.color : "#ffffff";
  return {
    size: Math.round(clampNumber(raw.size, 22, 16, 40)),
    color,
    backdrop: clampNumber(raw.backdrop, 0.72, 0, 0.9),
    outline: Math.round(clampNumber(raw.outline, 2, 0, 4)),
    lift: Math.round(clampNumber(raw.lift, 10, 0, 28)),
  };
}
export function cueOutline(width: number): string {
  if (width <= 0) return "none";
  const shadows: string[] = [];
  for (let step = 0; step < 8; step += 1) {
    const angle = (Math.PI * 2 * step) / 8;
    const x = Math.cos(angle) * width;
    const y = Math.sin(angle) * width;
    shadows.push(`${x.toFixed(2)}px ${y.toFixed(2)}px 0 #000`);
  }
  return shadows.join(", ");
}

function clockToSeconds(raw: string): number | null {
  const text = raw.trim().split(/\s/)[0] ?? "";
  const full = text.match(/^(\d+):(\d{2}):(\d{2})[.](\d{3})/);
  if (full) {
    return (
      Number(full[1]) * 3600 +
      Number(full[2]) * 60 +
      Number(full[3]) +
      Number(full[4]) / 1000
    );
  }
  const short = text.match(/^(\d+):(\d{2})[.](\d{3})/);
  if (!short) return null;
  return Number(short[1]) * 60 + Number(short[2]) + Number(short[3]) / 1000;
}

function plain(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function parseVtt(source: string): Cue[] {
  const text = srtToVtt(source).replace(/\r\n/g, "\n");
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const timing = lines[timingIndex] ?? "";
    const [rawStart, rawEnd] = timing.split("-->");
    const start = clockToSeconds(rawStart ?? "");
    const end = clockToSeconds(rawEnd ?? "");
    const body = plain(lines.slice(timingIndex + 1).join("\n"));
    if (start === null || end === null || !body || end <= start) continue;
    cues.push({ start, end, text: body });
  }
  return cues;
}

export function cueAt(cues: Cue[], time: number, delay: number): string | null {
  const lines = cues
    .filter((cue) => time >= cue.start + delay && time < cue.end + delay)
    .map((cue) => cue.text);
  return lines.length ? lines.join("\n") : null;
}

export function speechFromLog(log: string, limit: number): Array<[number, number]> {
  const events: { kind: "start" | "end"; time: number }[] = [];
  for (const match of log.matchAll(/silence_start:\s*([0-9.]+)/g)) {
    events.push({ kind: "start", time: Number(match[1]) });
  }
  for (const match of log.matchAll(/silence_end:\s*([0-9.]+)/g)) {
    events.push({ kind: "end", time: Number(match[1]) });
  }
  events.sort((left, right) => left.time - right.time || (left.kind === "end" ? -1 : 1));
  if (events.length === 0) return limit > 0 ? [[0, limit]] : [];

  const speech: Array<[number, number]> = [];
  let cursor = 0;
  let silent = false;
  for (const event of events) {
    if (event.kind === "start") {
      if (!silent && event.time > cursor) speech.push([cursor, event.time]);
      silent = true;
    } else {
      cursor = event.time;
      silent = false;
    }
  }
  if (!silent && cursor < limit) speech.push([cursor, limit]);
  return speech.filter(([start, end]) => end - start >= 0.2);
}

function covers(speech: Array<[number, number]>, time: number): boolean {
  return speech.some(([start, end]) => time >= start && time <= end);
}

export function bestOffset(
  cues: Cue[],
  speech: Array<[number, number]>,
  span = 20,
  step = 0.25,
): number {
  let best = 0;
  let bestScore = -1;
  const end = span + step / 2;
  for (let offset = -span; offset <= end; offset += step) {
    let score = 0;
    for (const cue of cues) {
      const mid = (cue.start + cue.end) / 2 + offset;
      if (covers(speech, mid)) score += cue.end - cue.start;
    }
    const rounded = Math.round(offset * 1000) / 1000;
    if (score > bestScore || (score === bestScore && Math.abs(rounded) < Math.abs(best))) {
      bestScore = score;
      best = rounded;
    }
  }
  return best;
}
