import { describe, expect, it } from "vitest";
import {
  lastStderrLine,
  parseProbe,
  playbackKind,
  progressFromChunk,
  requiresStreamCopy,
} from "./probe";

const sample = `
Duration: 00:00:10.50, start: 0.000000, bitrate: 1200 kb/s
Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1920x1080, 30 fps
Stream #0:1(und): Audio: aac (LC), 48000 Hz, stereo
`;

describe("parseProbe", () => {
  it("reads duration, codecs, and frame size", () => {
    expect(parseProbe(sample)).toEqual({
      videoCodec: "h264",
      audioCodec: "aac",
      width: 1920,
      height: 1080,
      duration: 10.5,
    });
  });
});

describe("playbackKind", () => {
  it("plays mp4 directly and remuxes h264 mkv", () => {
    const probe = parseProbe(sample);
    expect(playbackKind("mp4", probe)).toBe("direct");
    expect(playbackKind("mkv", probe)).toBe("remux");
    expect(playbackKind("avi", { ...probe, videoCodec: "mpeg4" })).toBe("unplayable");
  });
});

describe("requiresStreamCopy", () => {
  it("copies AV1 because this ffmpeg cannot decode it", () => {
    expect(requiresStreamCopy("av1")).toBe(true);
    expect(requiresStreamCopy("av01")).toBe(true);
    expect(requiresStreamCopy("h264")).toBe(false);
    expect(requiresStreamCopy(null)).toBe(false);
  });
});

describe("progressFromChunk", () => {
  it("treats out_time_ms as microseconds", () => {
    expect(progressFromChunk("out_time_ms=2500000\n", 10)).toBe(0.25);
  });
});

describe("lastStderrLine", () => {
  it("returns the last non-empty line", () => {
    expect(lastStderrLine("start\n\nConversion failed\n")).toBe("Conversion failed");
  });
});
