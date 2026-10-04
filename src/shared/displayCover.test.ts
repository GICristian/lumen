import { describe, expect, it } from "vitest";
import { coversDisplay } from "./displayCover";

const monitor = { x: 0, y: 0, width: 1920, height: 1080 };

describe("fullscreen cover", () => {
  it("treats a borderless game as covering the monitor", () => {
    expect(coversDisplay({ left: 0, top: 0, right: 1920, bottom: 1080 }, monitor)).toBe(true);
    expect(coversDisplay({ left: -8, top: -8, right: 1928, bottom: 1088 }, monitor)).toBe(true);
  });

  it("leaves a normal window alone", () => {
    expect(coversDisplay({ left: 200, top: 120, right: 1200, bottom: 800 }, monitor)).toBe(false);
  });
});
