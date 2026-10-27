export type CpuTimes = {
  idle: bigint;
  kernel: bigint;
  user: bigint;
};

export type PerfBox = { x: number; y: number; width: number; height: number };

/** Design size of the readout. The window grows with the scale. */
export const PERF_BASE = { width: 180, height: 22 };

export type PerfCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** Scale steps of 10%, from a smaller line up to the design size. */
export function perfScaleOf(value: unknown): number {
  const raw = typeof value === "number" ? value : 1;
  if (!Number.isFinite(raw)) return 1;
  const stepped = Math.round(raw * 10) / 10;
  return Math.min(1, Math.max(0.8, stepped));
}

/** Card opacity. The numbers stay solid enough to read. */
export function perfOpacityOf(value: unknown): number {
  const raw = typeof value === "number" ? value : 0.92;
  if (!Number.isFinite(raw)) return 0.92;
  const stepped = Math.round(raw * 100) / 100;
  return Math.min(1, Math.max(0.35, stepped));
}

export function perfSize(scale: number): { width: number; height: number } {
  const next = perfScaleOf(scale);
  return {
    width: Math.round(PERF_BASE.width * next),
    height: Math.round(PERF_BASE.height * next),
  };
}

export function unionPerf(areas: PerfBox[]): PerfBox | null {
  if (areas.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const area of areas) {
    minX = Math.min(minX, area.x);
    minY = Math.min(minY, area.y);
    maxX = Math.max(maxX, area.x + area.width);
    maxY = Math.max(maxY, area.y + area.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function areaAt(x: number, y: number, areas: PerfBox[]): PerfBox | null {
  for (const area of areas) {
    const inside = x >= area.x && y >= area.y
      && x < area.x + area.width && y < area.y + area.height;
    if (inside) return area;
  }
  return null;
}

export function cornerPerf(
  area: PerfBox,
  size: { width: number; height: number },
  corner: PerfCorner,
): { x: number; y: number } {
  const right = corner === "top-right" || corner === "bottom-right";
  const bottom = corner === "bottom-left" || corner === "bottom-right";
  return placePerf({
    x: right ? area.x + area.width - size.width - 24 : area.x + 24,
    y: bottom ? area.y + area.height - size.height - 24 : area.y + 24,
  }, area, size);
}

/** Processor time. Kernel time already includes the idle time. */
export function cpuPercent(previous: CpuTimes, next: CpuTimes): number | null {
  const idle = next.idle - previous.idle;
  const kernel = next.kernel - previous.kernel;
  const user = next.user - previous.user;
  const total = kernel + user;
  if (total <= 0n) return null;
  const busy = kernel - idle + user;
  if (busy <= 0n) return 0;
  const percent = Math.round(Number(busy) / Number(total) * 100);
  return Math.max(0, Math.min(100, percent));
}

/** Busiest graphics adapter, from the 3D engines of every process on it. */
export function gpuPercent(rows: { name: string; value: number }[]): number {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.name.endsWith("engtype_3D")) continue;
    const luid = /luid_(0x[0-9a-f]+_0x[0-9a-f]+)/i.exec(row.name);
    const key = luid?.[1] ?? "gpu";
    const value = Number.isFinite(row.value) ? Math.max(0, row.value) : 0;
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  let peak = 0;
  for (const total of totals.values()) peak = Math.max(peak, total);
  return Math.max(0, Math.min(100, Math.round(peak)));
}

export function ramPercent(load: number): number | null {
  if (!Number.isFinite(load)) return null;
  return Math.max(0, Math.min(100, Math.round(load)));
}

/** Frames presented by one process since the previous sample. */
export function fpsFromCounts(
  previous: number,
  next: number,
  elapsedMs: number,
): number | null {
  if (elapsedMs < 250 || elapsedMs > 5000) return null;
  const span = next >= previous ? next - previous : 0x100000000 - previous + next;
  if (span <= 0) return null;
  const fps = Math.round(span * 1000 / elapsedMs);
  if (fps <= 0 || fps > 1000) return null;
  return fps;
}

export function placePerf(
  saved: { x: number; y: number } | null,
  area: PerfBox,
  size: { width: number; height: number },
): { x: number; y: number } {
  const margin = 24;
  const raw = saved ?? {
    x: area.x + area.width - size.width - margin,
    y: area.y + margin,
  };
  const maxX = area.x + area.width - size.width;
  const maxY = area.y + area.height - size.height;
  return {
    x: Math.min(maxX, Math.max(area.x, Math.round(raw.x))),
    y: Math.min(maxY, Math.max(area.y, Math.round(raw.y))),
  };
}

export function clampPerf(
  x: number,
  y: number,
  size: { width: number; height: number },
  areas: PerfBox[],
): { x: number; y: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const area of areas) {
    minX = Math.min(minX, area.x);
    minY = Math.min(minY, area.y);
    maxX = Math.max(maxX, area.x + area.width);
    maxY = Math.max(maxY, area.y + area.height);
  }
  if (!Number.isFinite(minX)) return { x: Math.round(x), y: Math.round(y) };
  return {
    x: Math.min(maxX - size.width, Math.max(minX, Math.round(x))),
    y: Math.min(maxY - size.height, Math.max(minY, Math.round(y))),
  };
}
