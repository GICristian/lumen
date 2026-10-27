import { describe, expect, it } from "vitest";
import {
  areaAt,
  clampPerf,
  cornerPerf,
  cpuPercent,
  fpsFromCounts,
  gpuPercent,
  perfOpacityOf,
  perfScaleOf,
  perfSize,
  placePerf,
  ramPercent,
  unionPerf,
} from "./perf";

describe("performance readout", () => {
  it("turns processor times into a percent", () => {
    const previous = { idle: 0n, kernel: 0n, user: 0n };
    const next = { idle: 60n, kernel: 80n, user: 20n };
    expect(cpuPercent(previous, next)).toBe(40);
    expect(cpuPercent(previous, previous)).toBeNull();
  });

  it("uses the busiest adapter's 3D engines", () => {
    const rows = [
      { name: "pid_1_luid_0x0_0x11_phys_0_eng_0_engtype_3D", value: 20 },
      { name: "pid_2_luid_0x0_0x11_phys_0_eng_1_engtype_3D", value: 30 },
      { name: "pid_2_luid_0x0_0x11_phys_0_eng_2_engtype_Copy", value: 90 },
      { name: "pid_3_luid_0x0_0x22_phys_0_eng_0_engtype_3D", value: 70 },
    ];
    expect(gpuPercent(rows)).toBe(70);
    expect(gpuPercent([])).toBe(0);
  });

  it("counts frames across a sample and ignores an empty interval", () => {
    expect(fpsFromCounts(10, 130, 500)).toBe(240);
    expect(fpsFromCounts(10, 10, 500)).toBeNull();
    expect(fpsFromCounts(0xfffffff0, 16, 500)).toBe(64);
    expect(ramPercent(41.2)).toBe(41);
  });

  it("keeps the readout on the display, including a dragged corner", () => {
    const area = { x: 0, y: 0, width: 1920, height: 1080 };
    const size = { width: 196, height: 124 };
    expect(placePerf(null, area, size)).toEqual({ x: 1700, y: 24 });
    expect(placePerf({ x: 12, y: 4000 }, area, size).y).toBe(956);
    const moved = clampPerf(2000, -10, size, [
      area,
      { x: 1920, y: -3, width: 1920, height: 1080 },
    ]);
    expect(moved).toEqual({ x: 2000, y: -3 });
  });

  it("places and sizes the readout from the settings window", () => {
    const area = { x: 0, y: 0, width: 1920, height: 1080 };
    const size = { width: 196, height: 136 };
    expect(perfScaleOf(1.24)).toBe(1);
    expect(perfScaleOf(0.2)).toBe(0.8);
    expect(perfOpacityOf(0.2)).toBe(0.35);
    expect(perfScaleOf(0.84)).toBe(0.8);
    expect(perfSize(2)).toEqual({ width: 180, height: 22 });
    expect(cornerPerf(area, size, "bottom-left")).toEqual({ x: 24, y: 920 });
    expect(cornerPerf(area, size, "bottom-right")).toEqual({ x: 1700, y: 920 });
    const second = { x: 1920, y: -3, width: 1920, height: 1080 };
    expect(unionPerf([area, second])).toEqual({
      x: 0,
      y: -3,
      width: 3840,
      height: 1083,
    });
    expect(areaAt(2000, 10, [area, second])).toEqual(second);
    expect(areaAt(-20, 10, [area, second])).toBeNull();
  });
});
