import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import { buildExportArgs } from "./exportArgs";
import { parseProbe } from "./probe";

function run(bin: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

describe("ffmpeg export", () => {
  it("trims and crops a generated clip without changing the source", async () => {
    if (!ffmpegStatic) return;
    const dir = await mkdtemp(path.join(tmpdir(), "lumen-"));
    const source = path.join(dir, "clip.mp4");
    const made = await run(ffmpegStatic, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x240:rate=30:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      source,
    ]);
    expect(made.code, made.stderr).toBe(0);
    const before = await stat(source);

    const trim = path.join(dir, "clip_trim.mp4");
    const trimmed = await run(
      ffmpegStatic,
      buildExportArgs({
        input: source,
        output: trim,
        start: 0.2,
        end: 1.2,
        precise: false,
        crop: null,
        hasAudio: true,
      }),
    );
    expect(trimmed.code, trimmed.stderr).toBe(0);

    const crop = path.join(dir, "clip_edit.mp4");
    const cropped = await run(
      ffmpegStatic,
      buildExportArgs({
        input: source,
        output: crop,
        start: null,
        end: null,
        precise: false,
        crop: { x: 0, y: 0, w: 160, h: 120 },
        hasAudio: true,
      }),
    );
    expect(cropped.code, cropped.stderr).toBe(0);

    const after = await stat(source);
    expect(after.size).toBe(before.size);
    expect((await stat(trim)).size).toBeGreaterThan(0);
    expect((await stat(crop)).size).toBeGreaterThan(0);
    const probed = await run(ffmpegStatic, ["-hide_banner", "-i", crop]);
    expect(parseProbe(probed.stderr).videoCodec).toBe("h264");
    await rm(dir, { recursive: true, force: true });
  }, 30000);
});
