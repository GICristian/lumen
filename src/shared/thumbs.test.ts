import { describe, expect, it } from "vitest";
import { bufferLooksLikeAv1, stillAttempts, thumbGrabArgs } from "./thumbs";

describe("thumbnail grabs", () => {
  it("recognizes an AV1 brand and a WebM AV1 track", () => {
    expect(bufferLooksLikeAv1(new TextEncoder().encode("ftypav01"))).toBe(true);
    expect(bufferLooksLikeAv1(new TextEncoder().encode("V_AV1"))).toBe(true);
    expect(bufferLooksLikeAv1(new TextEncoder().encode("ftypisomavc1"))).toBe(false);
  });

  it("puts the NVIDIA decoder ahead of the input", () => {
    const args = thumbGrabArgs("clip.mp4", "out.jpg", "1", false, "av1_cuvid");
    expect(args.indexOf("av1_cuvid")).toBeGreaterThan(0);
    expect(args.indexOf("av1_cuvid")).toBeLessThan(args.indexOf("-i"));
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args).toContain("scale=480:-2");
  });

  it("keeps a software seek in front of the input", () => {
    const args = thumbGrabArgs("clip.mp4", "out.jpg", "1", false, "software");
    expect(args).not.toContain("av1_cuvid");
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
  });

  it("decodes up to the timestamp when the seek is accurate", () => {
    const args = thumbGrabArgs("clip.mp4", "out.jpg", "1", true, "software");
    expect(args.indexOf("-i")).toBeLessThan(args.indexOf("-ss"));
  });

  it("tries the NVIDIA decoder before a short software fallback on AV1", () => {
    const attempts = stillAttempts(80, "av1_cuvid");
    expect(attempts[0]).toMatchObject({ seek: "1", decoder: "av1_cuvid" });
    expect(attempts.at(-1)?.decoder).toBe("software");
    expect(attempts.at(-1)?.timeoutMs).toBeLessThan(20_000);
    expect(stillAttempts(0.4, "av1_cuvid").map((item) => item.seek)).toEqual(["0", "0"]);
  });

  it("keeps the fast seek, the start, and an accurate seek for other codecs", () => {
    const attempts = stillAttempts(null, "software");
    expect(attempts.map((item) => [item.seek, item.accurate])).toEqual([
      ["1", false],
      ["0", false],
      ["1", true],
    ]);
  });
});
