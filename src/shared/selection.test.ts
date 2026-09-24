import { describe, expect, it } from "vitest";
import { rangeSelection, toggleSelection } from "./selection";

const order = ["a.mp4", "b.mp4", "c.mp4", "d.mp4"];

describe("toggleSelection", () => {
  it("adds a clip and removes it on the next toggle", () => {
    const added = toggleSelection([], "a.mp4");
    expect(added).toEqual(["a.mp4"]);
    expect(toggleSelection(added, "a.mp4")).toEqual([]);
  });
});

describe("rangeSelection", () => {
  it("selects every clip between the anchor and the clicked one", () => {
    expect(rangeSelection(order, "b.mp4", "d.mp4", ["b.mp4"])).toEqual([
      "b.mp4",
      "c.mp4",
      "d.mp4",
    ]);
  });

  it("keeps clips that were already selected outside the range", () => {
    expect(rangeSelection(order, "c.mp4", "d.mp4", ["a.mp4"])).toEqual([
      "a.mp4",
      "c.mp4",
      "d.mp4",
    ]);
  });
});
