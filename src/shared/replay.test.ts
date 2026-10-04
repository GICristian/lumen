import { describe, expect, it } from "vitest";
import { buildFileMixSaveArgs, buildMixSaveArgs, buildSaveArgs, concatLine, encodeVideoArgs, pictureBroken, replayFileName, segmentsToDrop, replayDimensions, replayBuffer, replayTail } from "./replay";

describe("capture sizing and duration", () => {
  it("scales the full screen without stretching, cropping or upscaling", () => {
    expect(replayDimensions(3840, 2160, 720)).toEqual({ width: 1280, height: 720 });
    expect(replayDimensions(3440, 1440, 720)).toEqual({ width: 1720, height: 720 });
    expect(replayDimensions(1080, 1920, 720)).toEqual({ width: 406, height: 720 });
    expect(replayDimensions(640, 480, 1080)).toEqual({ width: 640, height: 480 });
  });
  it("accepts custom seconds and covers the window after a partial save", () => {
    expect(replayBuffer(73)).toBe(73);
    expect(replayBuffer(0)).toBe(60);
    expect(replayBuffer(9999)).toBe(900);
    expect(replayTail([{ duration: 4 }, { duration: 4 }, { duration: 1 }], 5)).toEqual([{ duration: 4 }, { duration: 1 }]);
  });
});

describe("segmentsToDrop", () => {
  it("keeps the segment being written and the requested window", () => {
    expect(segmentsToDrop(1, 4, 30)).toBe(0);
    expect(segmentsToDrop(9, 4, 30)).toBe(0);
    expect(segmentsToDrop(10, 4, 30)).toBe(1);
    expect(segmentsToDrop(20, 4, 30)).toBe(11);
  });
});

describe("save", () => {
  it("escapes concat paths and can re-encode when a copy will not mux", () => {
    expect(concatLine("C:\\Clips\\it's.mp4")).toBe("file 'C:/Clips/it'\\''s.mp4'");
    const copy = buildSaveArgs("list.txt", "out.mp4", true);
    expect(copy).toContain("copy");
    expect(copy).not.toContain("libx264");
    const encoded = buildSaveArgs("list.txt", "out.mp4", false);
    expect(encoded).toContain("libx264");
    expect(encoded).not.toContain("copy");
    expect(replayFileName(new Date(2026, 9, 4, 14, 5, 2))).toBe(
      "Replay 2026-10-04 14-05-02.mp4",
    );
    expect(pictureBroken("Invalid NAL unit 0, skipping.")).toBe(true);
    expect(pictureBroken("")).toBe(false);
    const nvenc = buildSaveArgs("list.txt", "out.mp4", false, undefined, "h264_nvenc");
    expect(nvenc).toContain("h264_nvenc");
    expect(nvenc).not.toContain("libx264");
    expect(encodeVideoArgs("missing")).toContain("libx264");
    const mixed = buildMixSaveArgs("video.txt", "mic.txt", "out.mp4", true, 12, "h264_nvenc", 1, 1.6);
    const graph = mixed.join(" ");
    expect(graph).toContain("normalize=0");
    expect(graph).toContain("volume=1.600");
    expect(graph).not.toContain("[0:a]aresample=48000:async=1:first_pts=0,volume=");
    expect(graph).not.toContain("h264_nvenc");
    expect(mixed[mixed.indexOf("-c:v") + 1]).toBe("copy");
    const ahead = buildFileMixSaveArgs("v.webm", "m.webm", "out.mp4", true, 8, "libx264", 1, 1.6, 12, 11.96, 40);
    const aheadText = ahead.join(" ");
    expect(aheadText).toContain("adelay=40|40");
    expect(aheadText).toContain("normalize=0");
    expect(aheadText).toContain("atrim=start=12.000");
    expect(aheadText).toContain("atrim=start=11.960");
    expect(aheadText).not.toContain("-ss");
    const behind = buildFileMixSaveArgs("v.webm", "m.webm", "out.mp4", false, 8, "libx264", 1, 1, 0, 0, -30);
    expect(behind.join(" ")).toContain("atrim=start=0.030");
    expect(behind.join(" ")).not.toContain("adelay=");
  });
});
