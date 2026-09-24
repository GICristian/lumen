import { describe, expect, it } from "vitest";
import {
  estimateExportBytes,
  filterClips,
  formatBytes,
  formatMbps,
  formatWhen,
  sortClips,
  sourceVideoKbps,
} from "./clips";

const clips = [
  { name: "b.mp4", mtimeMs: 20, sizeBytes: 100 },
  { name: "a.mp4", mtimeMs: 30, sizeBytes: 50 },
  { name: "c.mp4", mtimeMs: 10, sizeBytes: 400 },
];

describe("sortClips", () => {
  it("puts the newest file first", () => {
    expect(sortClips(clips, "recent").map((item) => item.name)).toEqual([
      "a.mp4",
      "b.mp4",
      "c.mp4",
    ]);
  });

  it("sorts by name, age, and size", () => {
    expect(sortClips(clips, "name").map((item) => item.name)).toEqual(["a.mp4", "b.mp4", "c.mp4"]);
    expect(sortClips(clips, "oldest").map((item) => item.name)).toEqual([
      "c.mp4",
      "b.mp4",
      "a.mp4",
    ]);
    expect(sortClips(clips, "largest").map((item) => item.name)).toEqual([
      "c.mp4",
      "b.mp4",
      "a.mp4",
    ]);
  });
});

describe("filterClips", () => {
  it("matches a case-insensitive part of the name", () => {
    expect(filterClips(clips, "  B ")).toEqual([clips[0]]);
    expect(filterClips(clips, "")).toHaveLength(3);
  });
});

describe("estimateExportBytes", () => {
  it("keeps the source size when the export is a copy", () => {
    expect(
      estimateExportBytes({
        sourceBytes: 4096,
        durationSec: 10,
        videoKbps: null,
        hasAudio: true,
      }),
    ).toBe(4096);
  });

  it("scales a copied trim by how much of the file is kept", () => {
    expect(
      estimateExportBytes({
        sourceBytes: 8000,
        durationSec: 10,
        spanSec: 2.5,
        videoKbps: null,
        hasAudio: true,
      }),
    ).toBe(2000);
  });

  it("estimates a re-encode from video and audio bitrate", () => {
    const bytes = estimateExportBytes({
      sourceBytes: 999,
      durationSec: 8,
      videoKbps: 8000,
      hasAudio: true,
    });
    const expected = Math.round(((8000 + 192) * 1000 / 8) * 8);
    expect(bytes).toBe(expected);
  });
});

describe("sourceVideoKbps", () => {
  it("subtracts audio from the file bitrate", () => {
    const bytes = (10_000 * 1000 * 10) / 8;
    expect(sourceVideoKbps(bytes, 10, true)).toBe(10000 - 192);
  });
});

describe("formatters", () => {
  it("formats size, bitrate, and recency", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatMbps(8000)).toBe("8.0 Mbps");
    expect(formatMbps(16000)).toBe("16 Mbps");
    const now = Date.parse("2026-03-22T12:00:00Z");
    expect(formatWhen(now - 30_000, now)).toBe("Just now");
    expect(formatWhen(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatWhen(now - 3 * 60 * 60_000, now)).toBe("3h ago");
  });
});
