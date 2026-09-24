import { describe, expect, it } from "vitest";
import { buildExportArgs } from "./exportArgs";

describe("buildExportArgs", () => {
  it("stream-copies a trim and keeps audio optional", () => {
    expect(
      buildExportArgs({
        input: "C:/in.mp4",
        output: "C:/out.mp4",
        start: 1,
        end: 4,
        precise: false,
        crop: null,
        hasAudio: true,
      }),
    ).toEqual([
      "-y",
      "-ss",
      "1",
      "-to",
      "4",
      "-i",
      "C:/in.mp4",
      "-map",
      "0:v",
      "-map",
      "0:a?",
      "-c",
      "copy",
      "-avoid_negative_ts",
      "make_zero",
      "-progress",
      "pipe:1",
      "C:/out.mp4",
    ]);
  });

  it("re-encodes a crop and skips audio when the file is silent", () => {
    const args = buildExportArgs({
      input: "C:/in.mp4",
      output: "C:/out.mp4",
      start: null,
      end: null,
      precise: false,
      crop: { x: 0, y: 2, w: 100, h: 80 },
      hasAudio: false,
    });
    expect(args).toContain("crop=100:80:0:2");
    expect(args).toContain("libx264");
    expect(args).toContain("-crf");
    expect(args).not.toContain("-c:a");
    expect(args).not.toContain("0:a?");
  });

  it("uses the requested video bitrate instead of a fixed quality", () => {
    const args = buildExportArgs({
      input: "C:/in.mp4",
      output: "C:/out.mp4",
      start: null,
      end: null,
      precise: true,
      crop: null,
      hasAudio: true,
      videoBitrateKbps: 8000,
    });
    expect(args).toContain("-b:v");
    expect(args).toContain("8000k");
    expect(args).not.toContain("-crf");
  });
});
