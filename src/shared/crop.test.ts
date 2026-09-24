import { describe, expect, it } from "vitest";
import {
  containedVideoBox,
  defaultCrop,
  evenRect,
  mapCropToVideoPixels,
  presetCrop,
} from "./crop";

describe("evenRect", () => {
  it("snaps odd edges even and stays inside the frame", () => {
    expect(evenRect({ x: 1, y: 1, w: 11, h: 9 }, { width: 20, height: 20 })).toEqual({
      x: 0,
      y: 0,
      w: 10,
      h: 8,
    });
  });
});

describe("containedVideoBox", () => {
  it("letterboxes a wide video", () => {
    expect(
      containedVideoBox({ left: 0, top: 0, width: 200, height: 200 }, 400, 200),
    ).toEqual({
      left: 0,
      top: 50,
      width: 200,
      height: 100,
    });
  });
});

describe("mapCropToVideoPixels", () => {
  it("maps a display rect through the letterbox into even video pixels", () => {
    const videoBox = { left: 0, top: 50, width: 200, height: 100 };
    const display = { left: 0, top: 50, width: 100, height: 100 };
    expect(mapCropToVideoPixels(display, videoBox, 400, 200)).toEqual({
      x: 0,
      y: 0,
      w: 200,
      h: 200,
    });
  });
});

describe("presets", () => {
  it("starts at 80 percent centered", () => {
    expect(defaultCrop(100, 100)).toEqual({ x: 10, y: 10, w: 80, h: 80 });
  });

  it("fits a 1:1 preset inside a wide frame", () => {
    const rect = presetCrop(200, 100, 1);
    expect(rect.w).toBe(rect.h);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.y).toBe(0);
  });
});
