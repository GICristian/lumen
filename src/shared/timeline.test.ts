import { describe, expect, it } from "vitest";
import { snapTimelineTime } from "./timeline";

describe("timeline magnetism", () => {
  it("uses the same six-pixel target for short and long clips", () => {
    expect(snapTimelineTime(10.5, 100, 1000, [10])).toBe(10);
    expect(snapTimelineTime(105, 1000, 1000, [100])).toBe(100);
    expect(snapTimelineTime(10.7, 100, 1000, [10])).toBe(10.7);
  });
  it("selects the nearest valid anchor and clamps to media bounds", () => {
    expect(snapTimelineTime(20.4, 100, 500, [20, 21, NaN, -1])).toBe(20);
    expect(snapTimelineTime(110, 100, 500, [])).toBe(100);
    expect(snapTimelineTime(-5, 100, 500, [])).toBe(0);
    expect(snapTimelineTime(10, 0, 0, [10])).toBe(0);
  });
});
