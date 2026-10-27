import { describe, expect, it } from "vitest";
import { bytesOf, staleClips } from "./cleanup";

const DAY = 24 * 60 * 60 * 1000;

describe("stale clips", () => {
  it("selects clips that have not been opened for three weeks", () => {
    const now = 100 * DAY;
    const picked = staleClips([
      { path: "new.mp4", sizeBytes: 10, mtimeMs: now - DAY, seenAt: now - DAY },
      { path: "old.mp4", sizeBytes: 40, mtimeMs: now - 30 * DAY, seenAt: now - 30 * DAY },
      { path: "never.mp4", sizeBytes: 20, mtimeMs: now - 40 * DAY, seenAt: null },
    ], now);
    expect(picked.map((clip) => clip.path)).toEqual(["never.mp4", "old.mp4"]);
    expect(bytesOf(picked)).toBe(60);
  });
});