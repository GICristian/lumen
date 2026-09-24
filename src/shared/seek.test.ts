import { describe, expect, it } from "vitest";
import { applySeek, seekStep } from "./seek";

describe("seekStep", () => {
  it("uses 5 percent of the duration", () => {
    expect(seekStep(100)).toBe(5);
  });

  it("floors the step at 0.5 seconds", () => {
    expect(seekStep(4)).toBe(0.5);
  });

  it("returns null when duration is not usable", () => {
    expect(seekStep(0)).toBeNull();
    expect(seekStep(Number.NaN)).toBeNull();
    expect(seekStep(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("applySeek", () => {
  it("clamps to the ends of the clip", () => {
    expect(applySeek(1, 100, -1)).toBe(0);
    expect(applySeek(98, 100, 1)).toBe(100);
  });

  it("returns null when the clip has no duration", () => {
    expect(applySeek(0, 0, 1)).toBeNull();
  });

  it("moves one second when a fine step is given", () => {
    expect(applySeek(10, 100, 1, 1)).toBe(11);
    expect(applySeek(0.2, 100, -1, 1)).toBe(0);
  });
});
