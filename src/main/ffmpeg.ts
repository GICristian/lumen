import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import type { ExportRequest, PrepareResult } from "@shared/contracts";
import { buildExportArgs } from "@shared/exportArgs";
import { nextOutputPath } from "@shared/exportPaths";
import {
  lastStderrLine,
  parseProbe,
  playbackKind,
  progressFromChunk,
  type Probe,
} from "@shared/probe";
import {
  bufferLooksLikeAv1,
  stillAttempts,
  thumbGrabArgs,
  type ThumbDecoder,
} from "@shared/thumbs";

const CACHE_LIMIT = 2 * 1024 * 1024 * 1024;
const emptyProbe: Probe = {
  videoCodec: null,
  audioCodec: null,
  width: null,
  height: null,
  duration: null,
};

export function ffmpegBinary(): string {
  if (!ffmpegStatic) throw new Error("ffmpeg is not available");
  return ffmpegStatic.replace("app.asar", "app.asar.unpacked");
}

type RunResult = { code: number; stdout: string; stderr: string };

function run(args: string[], timeoutMs = 0): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill();
      }, timeoutMs);
    }
    const finish = (code: number): void => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      finish(code ?? 1);
    });
  });
}

export async function probeFile(filePath: string): Promise<Probe> {
  const result = await run(["-hide_banner", "-i", filePath]);
  return parseProbe(result.stderr);
}

async function cacheKey(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  return createHash("sha1")
    .update(`${filePath}|${stat.mtimeMs}|${stat.size}`)
    .digest("hex");
}

async function evictOldest(dir: string, keep: string): Promise<void> {
  const names = await fs.readdir(dir).catch(() => []);
  const files = await Promise.all(
    names.map(async (name) => {
      const full = path.join(dir, name);
      const stat = await fs.stat(full);
      return { full, size: stat.size, mtime: stat.mtimeMs };
    }),
  );
  let total = files.reduce((sum, file) => sum + file.size, 0);
  if (total <= CACHE_LIMIT) return;
  const ordered = files
    .filter((file) => file.full !== keep)
    .sort((a, b) => a.mtime - b.mtime);
  for (const file of ordered) {
    if (total <= CACHE_LIMIT) break;
    await fs.rm(file.full, { force: true });
    total -= file.size;
  }
}

export async function preparePlayback(
  filePath: string,
  cacheDir: string,
): Promise<PrepareResult> {
  const extension = path.extname(filePath).slice(1);
  let probe = emptyProbe;
  let ffmpegOk = true;
  try {
    probe = await probeFile(filePath);
  } catch (error) {
    ffmpegOk = false;
    console.error("ffmpeg probe failed", filePath, error);
  }

  const kind = playbackKind(extension, probe);
  if (kind === "direct") return { playablePath: filePath, probe, ffmpegOk };
  if (!ffmpegOk || kind === "unplayable") {
    return { playablePath: null, probe, ffmpegOk };
  }

  await fs.mkdir(cacheDir, { recursive: true });
  const output = path.join(cacheDir, `${await cacheKey(filePath)}.mp4`);
  try {
    await fs.access(output);
    return { playablePath: output, probe, ffmpegOk };
  } catch {
    // Cache miss. Remux below.
  }

  const args = ["-y", "-i", filePath, "-map", "0:v:0"];
  if (probe.audioCodec) args.push("-map", "0:a:0");
  args.push("-c", "copy", output);
  const result = await run(args);
  if (result.code !== 0) {
    await fs.rm(output, { force: true });
    console.error("remux failed", filePath, result.code, lastStderrLine(result.stderr));
    return { playablePath: null, probe, ffmpegOk };
  }
  await evictOldest(cacheDir, output);
  return { playablePath: output, probe, ffmpegOk };
}

const THUMB_SLOTS = 3;
let thumbActive = 0;
const thumbQueue: Array<() => void> = [];
const thumbInflight = new Map<string, Promise<string | null>>();

function scheduleThumb<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = (): void => {
      thumbActive += 1;
      task().then(resolve, reject).finally(() => {
        thumbActive -= 1;
        const next = thumbQueue.shift();
        if (next) next();
      });
    };
    if (thumbActive < THUMB_SLOTS) start();
    else thumbQueue.push(start);
  });
}

export function thumbnail(
  filePath: string,
  cacheDir: string,
  duration: number | null,
): Promise<string | null> {
  const existing = thumbInflight.get(filePath);
  if (existing) return existing;
  const job = scheduleThumb(() => makeThumbnail(filePath, cacheDir, duration)).finally(() => {
    thumbInflight.delete(filePath);
  });
  thumbInflight.set(filePath, job);
  return job;
}

const HEADER_SCAN = 64 * 1024;

async function videoDecoder(filePath: string): Promise<ThumbDecoder> {
  try {
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(HEADER_SCAN);
      const { bytesRead } = await handle.read(buffer, 0, HEADER_SCAN, 0);
      const header = buffer.subarray(0, bytesRead);
      return bufferLooksLikeAv1(header) ? "av1_cuvid" : "software";
    } finally {
      await handle.close();
    }
  } catch {
    return "software";
  }
}

async function grabFrame(
  filePath: string,
  output: string,
  seek: string,
  accurate: boolean,
  decoder: ThumbDecoder,
  timeoutMs: number,
): Promise<boolean> {
  const args = thumbGrabArgs(filePath, output, seek, accurate, decoder);
  const result = await run(args, timeoutMs);
  if (result.code !== 0) {
    await fs.rm(output, { force: true });
    return false;
  }
  try {
    const info = await fs.stat(output);
    if (info.size < 100) {
      await fs.rm(output, { force: true });
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

async function writeStill(
  filePath: string,
  output: string,
  duration: number | null,
): Promise<boolean> {
  const decoder = await videoDecoder(filePath);
  for (const attempt of stillAttempts(duration, decoder)) {
    const wrote = await grabFrame(
      filePath,
      output,
      attempt.seek,
      attempt.accurate,
      attempt.decoder,
      attempt.timeoutMs,
    );
    if (wrote) return true;
  }
  return false;
}

/** One still from a local file. The caller deletes the jpeg. */
export async function capturePoster(filePath: string, output: string): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(output), { recursive: true });
    return await writeStill(filePath, output, null);
  } catch (error) {
    console.error("poster failed", filePath, error);
    return false;
  }
}

async function makeThumbnail(
  filePath: string,
  cacheDir: string,
  duration: number | null,
): Promise<string | null> {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const output = path.join(cacheDir, `${await cacheKey(filePath)}-480.jpg`);
    try {
      await fs.access(output);
      return output;
    } catch {
      // Generate a new frame.
    }
    if (await writeStill(filePath, output, duration)) return output;
    return null;
  } catch (error) {
    console.error("thumbnail failed", filePath, error);
    return null;
  }
}

const previewInflight = new Map<string, Promise<string | null>>();
let previewChain: Promise<void> = Promise.resolve();

export function previewClip(filePath: string, cacheDir: string): Promise<string | null> {
  const existing = previewInflight.get(filePath);
  if (existing) return existing;
  const job = previewChain.then(() => makePreview(filePath, cacheDir));
  previewChain = job.then(
    () => undefined,
    () => undefined,
  );
  previewInflight.set(filePath, job);
  void job.finally(() => {
    previewInflight.delete(filePath);
  });
  return job;
}

async function makePreview(filePath: string, cacheDir: string): Promise<string | null> {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const output = path.join(cacheDir, `${await cacheKey(filePath)}-preview-v2.mp4`);
    try {
      await fs.access(output);
      return output;
    } catch {
      // Build a small H.264 proxy the video element can play.
    }
    const result = await run([
      "-y",
      "-i",
      filePath,
      "-vf",
      "scale=960:-2",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "30",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      output,
    ]);
    if (result.code !== 0) {
      await fs.rm(output, { force: true });
      console.error("preview failed", filePath, result.code, lastStderrLine(result.stderr));
      return null;
    }
    await evictOldest(cacheDir, output);
    return output;
  } catch (error) {
    console.error("preview failed", filePath, error);
    return null;
  }
}

type ExportEvents = {
  progress: (payload: { jobId: string; ratio: number }) => void;
  done: (payload: { jobId: string; outputPath: string }) => void;
  error: (payload: { jobId: string; message: string }) => void;
};

type Job = {
  id: string;
  child: ChildProcess;
  output: string;
  cancelled: boolean;
  settled: boolean;
};

let currentJob: Job | null = null;

export async function startExport(
  request: ExportRequest,
  events: ExportEvents,
): Promise<{ jobId: string }> {
  if (currentJob) throw new Error("Export already running");
  try {
    await fs.stat(request.sourcePath);
  } catch {
    throw new Error("File not found");
  }

  const directory = request.outputPath ? path.dirname(request.outputPath) : path.dirname(request.sourcePath);
  let names: string[] = [];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    console.error("export folder unreadable", directory, error);
    throw new Error("Output not writable");
  }

  const suffix = request.crop || request.precise ? "edit" : "trim";
  const output = request.outputPath ?? nextOutputPath(request.sourcePath, suffix, names);
  if (path.resolve(output).toLowerCase() === path.resolve(request.sourcePath).toLowerCase()) {
    throw new Error("Choose a different name from the source clip");
  }
  const span =
    request.start !== null && request.end !== null
      ? Math.max(0.01, request.end - request.start)
      : request.duration;
  const args = buildExportArgs({
    input: request.sourcePath,
    output,
    start: request.start,
    end: request.end,
    precise: request.precise || request.crop !== null,
    crop: request.crop,
    hasAudio: request.hasAudio,
    videoBitrateKbps: request.videoBitrateKbps,
  });

  let child: ChildProcess;
  try {
    child = spawn(ffmpegBinary(), args, { windowsHide: true });
  } catch (error) {
    console.error("ffmpeg spawn failed", request.sourcePath, error);
    throw new Error("ffmpeg is not available");
  }

  const job: Job = {
    id: randomUUID(),
    child,
    output,
    cancelled: false,
    settled: false,
  };
  currentJob = job;
  let stderr = "";
  let progressBuffer = "";

  const finish = (): void => {
    if (job.settled) return;
    job.settled = true;
    if (currentJob?.id === job.id) currentJob = null;
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    progressBuffer += chunk.toString();
    const lines = progressBuffer.split(/\r?\n/);
    progressBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const ratio = progressFromChunk(line, span);
      if (ratio !== null) events.progress({ jobId: job.id, ratio });
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.on("error", (error) => {
    console.error("ffmpeg process error", request.sourcePath, error);
    finish();
    void fs.rm(output, { force: true });
    events.error({ jobId: job.id, message: "ffmpeg is not available" });
  });
  child.on("close", (code) => {
    if (job.settled) return;
    finish();
    if (job.cancelled) {
      void fs.rm(output, { force: true });
      return;
    }
    if (code === 0) {
      events.done({ jobId: job.id, outputPath: output });
      return;
    }
    console.error("ffmpeg export failed", request.sourcePath, code, lastStderrLine(stderr));
    void fs.rm(output, { force: true });
    events.error({ jobId: job.id, message: lastStderrLine(stderr) });
  });

  return { jobId: job.id };
}

export function cancelExport(jobId: string): void {
  if (!currentJob || currentJob.id !== jobId) return;
  currentJob.cancelled = true;
  currentJob.child.kill();
}
