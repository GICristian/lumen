import { describe, expect, it } from "vitest";
import { dragEnd, dragStart, normalizeRange, segmentShouldRestart, setMark } from "./range";

describe("normalizeRange", () => {
  it("swaps when b is before a", () => {
    expect(normalizeRange(8, 2, 10)).toEqual({ a: 2, b: 8 });
  });

  it("expands a span shorter than 0.1s", () => {
    expect(normalizeRange(5, 5.02, 10)).toEqual({ a: 5, b: 5.1 });
  });

  it("uses the whole clip when the clip is shorter than 0.1s", () => {
    expect(normalizeRange(0.04, 0.01, 0.05)).toEqual({ a: 0, b: 0.05 });
  });
});

describe("drag handles", () => {
  it("keeps the out point still while the in point follows the pointer", () => {
    expect(dragStart(4, 8, 10)).toEqual({ a: 4, b: 8 });
    expect(dragStart(9, 8, 10)).toEqual({ a: 7.9, b: 8 });
    expect(dragStart(-2, 8, 10)).toEqual({ a: 0, b: 8 });
  });

  it("keeps the in point still while the out point follows the pointer", () => {
    expect(dragEnd(2, 6, 10)).toEqual({ a: 2, b: 6 });
    expect(dragEnd(2, 1, 10)).toEqual({ a: 2, b: 2.1 });
    expect(dragEnd(2, 14, 10)).toEqual({ a: 2, b: 10 });
  });
});

describe("setMark", () => {
  it("stores a single mark without inventing the other", () => {
    expect(setMark({ a: null, b: null }, "a", 3, 10)).toEqual({ a: 3, b: null });
  });

  it("clamps a mark to the clip", () => {
    expect(setMark({ a: null, b: null }, "a", 14, 10)).toEqual({ a: 10, b: null });
  });

  it("normalizes once both marks exist", () => {
    expect(setMark({ a: 8, b: null }, "b", 2, 10)).toEqual({ a: 2, b: 8 });
  });
});

describe("segmentShouldRestart", () => {
  const playing = {
    current: 5,
    end: 8,
    paused: false,
    scrubbing: false,
    seeking: false,
    ended: false,
  };

  it("restarts once playback reaches the out point", () => {
    expect(segmentShouldRestart({ ...playing, current: 7.96 })).toBe(true);
    expect(segmentShouldRestart(playing)).toBe(false);
  });

  it("restarts when the file ends on the out point and stays put while seeking", () => {
    expect(
      segmentShouldRestart({ ...playing, current: 8, ended: true, paused: true }),
    ).toBe(true);
    expect(
      segmentShouldRestart({ ...playing, current: 5, ended: true, paused: true }),
    ).toBe(false);
    expect(segmentShouldRestart({ ...playing, current: 9, seeking: true })).toBe(false);
    expect(segmentShouldRestart({ ...playing, current: 9, scrubbing: true })).toBe(false);
    expect(segmentShouldRestart({ ...playing, current: 9, paused: true })).toBe(false);
  });
});
