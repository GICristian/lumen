import { describe, expect, it } from "vitest";
import { clampVolume, stepVolume } from "./volume";

describe("volume", () => {
  it("clamps to 0..1", () => {
    expect(clampVolume(-0.2)).toBe(0);
    expect(clampVolume(1.4)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(1);
  });

  it("steps by 0.05 and clamps", () => {
    expect(stepVolume(0.5, 1)).toBe(0.55);
    expect(stepVolume(0.02, -1)).toBe(0);
    expect(stepVolume(0.98, 1)).toBe(1);
  });
});
