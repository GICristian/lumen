import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import ffmpeg from "ffmpeg-static";
import { clusterStartSeconds, findClusterOffset, firstKeyframeSeconds, firstSampleSeconds, sharedMediaStart, splitWebmChunk, timecodeScaleNs } from "./webmPieces";

describe("webm pieces", () => {
  it("seeks both files from the first sample, not the older cluster base", () => {
    const cluster = new Uint8Array([
      0x1F, 0x43, 0xB6, 0x75, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
      0xE7, 0x82, 0x27, 0x10,
      0xA3, 0x41, 0x00,
      0x81, 0x13, 0x88, 0x80,
    ]);
    expect(clusterStartSeconds(cluster)).toBe(10);
    expect(firstSampleSeconds(cluster)).toBe(15);
    expect(sharedMediaStart(1718.159, 1718.219)).toBe(1718.159);
    expect(sharedMediaStart(1718.159, 0)).toBe(1718.159);
  });

  it("seeks to the first decodable frame, not the delta frames ahead of it", () => {
    const cluster = new Uint8Array([
      0x1F, 0x43, 0xB6, 0x75, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
      0xE7, 0x82, 0x27, 0x10,
      0xA3, 0x89, 0x81, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x01, 0x41,
      0xA3, 0x89, 0x81, 0x06, 0xA4, 0x80, 0x00, 0x00, 0x00, 0x01, 0x67,
    ]);
    expect(firstSampleSeconds(cluster)).toBe(10);
    expect(firstKeyframeSeconds(cluster)).toBe(11.7);
  });

  it("reads a cluster timecode without scanning the media", () => {
    const cluster = new Uint8Array([
      0x1F, 0x43, 0xB6, 0x75, 0x87,
      0xE7, 0x82, 0x03, 0xE8,
      0xA3, 0x81, 0x00,
    ]);
    expect(findClusterOffset(cluster)).toBe(0);
    expect(clusterStartSeconds(cluster)).toBe(1);
  });

  it("splits a live MediaRecorder segment that has an unknown length", () => {
    const bytes = new Uint8Array([
      0x18, 0x53, 0x80, 0x67,
      0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
      0x1F, 0x43, 0xB6, 0x75,
      0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
      0xE7, 0x82, 0x0F, 0xA0,
    ]);
    const split = splitWebmChunk(bytes);
    expect(split?.init?.byteLength).toBe(12);
    expect(split?.cluster[0]).toBe(0x1F);
    expect(clusterStartSeconds(split!.cluster)).toBe(4);
    const onlyCluster = split!.cluster;
    expect(splitWebmChunk(onlyCluster)?.init).toBeNull();
  });

  it("keeps a microphone slice on the previous cluster clock", () => {
    const blocks = new Uint8Array([
      0xA3, 0x84, 0x81, 0x04, 0xB0, 0x80,
      0xA3, 0x84, 0x81, 0x06, 0x54, 0x80,
    ]);
    const split = splitWebmChunk(blocks, 20000);
    expect(split?.init).toBeNull();
    expect(clusterStartSeconds(split!.cluster)).toBe(20);
    expect(split?.clusterMs).toBe(20000);
  });

  it("wraps a microphone slice that is only SimpleBlocks", () => {
    const blocks = new Uint8Array([
      0xA3, 0x84, 0x81, 0x04, 0xB0, 0x80,
      0xA3, 0x84, 0x81, 0x06, 0x54, 0x80,
    ]);
    const split = splitWebmChunk(blocks);
    expect(split?.init).toBeNull();
    expect(split?.cluster[0]).toBe(0x1F);
    expect(clusterStartSeconds(split!.cluster)).toBe(0);
    const again = splitWebmChunk(split!.cluster);
    expect(again?.init).toBeNull();
    expect(again?.cluster.byteLength).toBe(split!.cluster.byteLength);
  });

  it("keeps a cluster that follows a run of bare blocks", () => {
    const blocks = new Uint8Array([0xA3, 0x84, 0x81, 0x04, 0xB0, 0x80]);
    const cluster = new Uint8Array([
      0x1F, 0x43, 0xB6, 0x75, 0x87,
      0xE7, 0x82, 0x0F, 0xA0,
      0xA3, 0x81, 0x00,
    ]);
    const mixed = new Uint8Array(blocks.byteLength + cluster.byteLength);
    mixed.set(blocks);
    mixed.set(cluster, blocks.byteLength);
    const split = splitWebmChunk(mixed);
    expect(split?.init).toBeNull();
    expect(clusterStartSeconds(split!.cluster)).toBe(0);
    expect(split!.cluster[split!.cluster.byteLength - cluster.byteLength]).toBe(0x1F);
    expect(clusterStartSeconds(split!.cluster.subarray(split!.cluster.byteLength - cluster.byteLength))).toBe(4);
  });

  it("keeps leading video blocks on the previous cluster clock", () => {
    const blocks = new Uint8Array([0xA3, 0x84, 0x81, 0x04, 0xB0, 0x80]);
    const cluster = new Uint8Array([
      0x1F, 0x43, 0xB6, 0x75, 0x87,
      0xE7, 0x82, 0x13, 0x88,
      0xA3, 0x81, 0x00,
    ]);
    const mixed = new Uint8Array(blocks.byteLength + cluster.byteLength);
    mixed.set(blocks);
    mixed.set(cluster, blocks.byteLength);
    const split = splitWebmChunk(mixed, 4000);
    expect(clusterStartSeconds(split!.cluster)).toBe(4);
    expect(split?.clusterMs).toBe(5000);
    const follow = split!.cluster.byteLength - cluster.byteLength;
    expect(clusterStartSeconds(split!.cluster.subarray(follow))).toBe(5);
  });

  it("splits a real file back into a playable recording", async () => {
    if (!ffmpeg) throw new Error("FFmpeg is required");
    const dir = await mkdtemp(path.join(tmpdir(), "lumen-webm-"));
    const source = path.join(dir, "source.mkv");
    try {
      const made = spawnSync(ffmpeg, [
        "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30:duration=1",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "libopus", source,
      ], { windowsHide: true });
      expect(made.status, made.stderr.toString()).toBe(0);
      const bytes = new Uint8Array(await readFile(source));
      const split = splitWebmChunk(bytes);
      expect(split?.init && split.init.byteLength > 0).toBe(true);
      expect(split?.cluster[0]).toBe(0x1F);
      expect(clusterStartSeconds(split!.cluster, timecodeScaleNs(split!.init!))).toBe(0);
      const joined = path.join(dir, "joined.mkv");
      const whole = new Uint8Array(split!.init!.byteLength + split!.cluster.byteLength);
      whole.set(split!.init!);
      whole.set(split!.cluster, split!.init!.byteLength);
      expect(whole.byteLength).toBe(bytes.byteLength);
      await writeFile(joined, whole);
      const decoded = spawnSync(ffmpeg, ["-v", "error", "-i", joined, "-f", "null", "-"], { windowsHide: true });
      expect(decoded.status, decoded.stderr.toString()).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
