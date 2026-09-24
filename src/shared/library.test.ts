import { describe, expect, it } from "vitest";
import { isVideoName, naturalSort, siblingIndex } from "./library";

describe("isVideoName", () => {
  it("accepts supported extensions in any case", () => {
    expect(isVideoName("Clip.MP4")).toBe(true);
    expect(isVideoName("film.mkv")).toBe(true);
    expect(isVideoName("note.txt")).toBe(false);
  });
});

describe("naturalSort", () => {
  it("orders clip_2 before clip_10 without regard to case", () => {
    expect(naturalSort(["clip_10.mp4", "Clip_2.mp4", "clip_1.mp4"])).toEqual([
      "clip_1.mp4",
      "Clip_2.mp4",
      "clip_10.mp4",
    ]);
  });

  it("does not mutate the input array", () => {
    const names = ["b.mp4", "a.mp4"];
    naturalSort(names);
    expect(names).toEqual(["b.mp4", "a.mp4"]);
  });
});

describe("siblingIndex", () => {
  it("moves inside the list and reports the edges", () => {
    expect(siblingIndex(3, 1, 1)).toEqual({ index: 2 });
    expect(siblingIndex(3, 1, -1)).toEqual({ index: 0 });
    expect(siblingIndex(3, 0, -1)).toEqual({ edge: "first" });
    expect(siblingIndex(3, 2, 1)).toEqual({ edge: "last" });
  });
});
