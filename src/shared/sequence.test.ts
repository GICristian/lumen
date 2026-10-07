import { describe, expect, it } from "vitest";
import { buildSequenceArgs, sequenceFrame } from "./sequence";
import type { SequenceClip } from "./sequence";

function clip(patch: Partial<SequenceClip> = {}): SequenceClip {
  return {
    path: "D:/clips/one.mp4",
    start: 1,
    end: 4,
    volume: 0.82,
    crop: null,
    hasAudio: true,
    width: 1280,
    height: 720,
    fps: 30,
    ...patch,
  };
}

describe("buildSequenceArgs", () => {
  it("joins clips at full quality and keeps a quiet volume", () => {
    const args = buildSequenceArgs(
      [clip(), clip({ path: "D:/clips/two.mp4", hasAudio: false, crop: { x: 0, y: 0, w: 640, h: 360 } })],
      "D:/Lumen/Edits/one_edit.mp4",
    );
    const graph = args[args.indexOf("-filter_complex") + 1] ?? "";
    expect(args).toContain("D:/clips/one.mp4");
    expect(args).toContain("D:/clips/two.mp4");
    expect(graph).toContain("volume=0.820");
    expect(graph).toContain("crop=640:360:0:0");
    expect(graph).toContain("concat=n=2:v=1:a=1");
    expect(graph).toContain("anullsrc=");
    expect(args).toContain("18");
    expect(args.at(-1)).toBe("D:/Lumen/Edits/one_edit.mp4");
  });

  it("keeps the larger frame and does not drop a 60 fps clip to 30", () => {
    expect(sequenceFrame([
      clip(),
      clip({ width: 1920, height: 1080, fps: 60 }),
    ])).toEqual({ width: 1920, height: 1080, fps: 60 });
  });
});