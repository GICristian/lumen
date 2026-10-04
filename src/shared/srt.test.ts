import { describe, expect, it } from "vitest";
import { srtToVtt } from "./srt";

describe("srtToVtt", () => {
  it("turns comma timestamps into a WebVTT document", () => {
    const vtt = srtToVtt("1\n00:00:01,000 --> 00:00:02,500\nHello\n");
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:01.000 --> 00:00:02.500");
    expect(vtt).toContain("Hello");
  });

  it("leaves an existing WebVTT file unchanged", () => {
    const source = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n";
    expect(srtToVtt(source)).toBe(source);
  });
});
