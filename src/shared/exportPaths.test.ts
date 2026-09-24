import path from "node:path";
import { describe, expect, it } from "vitest";
import { nextOutputPath } from "./exportPaths";

describe("nextOutputPath", () => {
  it("uses the suffix for the first free file", () => {
    expect(nextOutputPath("D:/clips/clip.mkv", "trim", [])).toBe(
      path.win32.join("D:/clips", "clip_trim.mp4"),
    );
  });

  it("increments when the name is taken", () => {
    expect(nextOutputPath("D:/clips/clip.mp4", "edit", ["clip_edit.mp4"])).toBe(
      path.win32.join("D:/clips", "clip_edit_2.mp4"),
    );
  });

  it("never returns the source path", () => {
    const source = "D:/clips/clip_trim.mp4";
    const result = nextOutputPath(source, "trim", []);
    expect(result).not.toBe(source);
    expect(path.win32.basename(result)).toBe("clip_trim_trim.mp4");
  });
});
