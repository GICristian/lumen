import { mediaUrl } from "./usePlayback";

const frames = new Map<string, string>();
const pending = new Set<string>();
const queue: Array<{ path: string; bucket: number }> = [];
const listeners = new Set<() => void>();

let video: HTMLVideoElement | null = null;
let loadedPath = "";
let pumping = false;
let notifyQueued = false;

function keyOf(path: string, bucket: number): string {
  return `${path}|${bucket}`;
}

/** Quarter-second bucket so nearby filmstrip cells share one decoded frame. */
export function frameBucket(time: number): number {
  return Math.round(Math.max(0, time) * 4) / 4;
}

export function frameUrl(path: string, time: number): string | null {
  const value = frames.get(keyOf(path, frameBucket(time)));
  return value ? value : null;
}

export function requestFrames(path: string, times: readonly number[]): void {
  const fresh: Array<{ path: string; bucket: number }> = [];
  for (const time of times) {
    const bucket = frameBucket(time);
    const key = keyOf(path, bucket);
    if (frames.has(key) || pending.has(key)) continue;
    pending.add(key);
    fresh.push({ path, bucket });
  }
  if (fresh.length === 0) return;
  queue.unshift(...fresh);
  if (queue.length > 48) {
    for (const dropped of queue.splice(48)) {
      pending.delete(keyOf(dropped.path, dropped.bucket));
    }
  }
  void pump();
}

export function subscribeFrames(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emit(): void {
  if (notifyQueued) return;
  notifyQueued = true;
  requestAnimationFrame(() => {
    notifyQueued = false;
    for (const listener of listeners) listener();
  });
}

function waitFor(node: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(event));
    }, 8000);
    const done = (): void => { cleanup(); resolve(); };
    const fail = (): void => { cleanup(); reject(new Error("film")); };
    const cleanup = (): void => {
      window.clearTimeout(timer);
      node.removeEventListener(event, done);
      node.removeEventListener("error", fail);
    };
    node.addEventListener(event, done);
    node.addEventListener("error", fail);
  });
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  if (!video) {
    video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext("2d");
  while (queue.length > 0 && ctx && video) {
    const job = queue.shift();
    if (!job) break;
    const key = keyOf(job.path, job.bucket);
    try {
      if (loadedPath !== job.path) {
        video.src = mediaUrl(job.path);
        await waitFor(video, "loadeddata");
        loadedPath = job.path;
      }
      if (Math.abs(video.currentTime - job.bucket) > 0.04) {
        video.currentTime = Math.min(job.bucket, Math.max(0, (video.duration || job.bucket) - 0.01));
        await waitFor(video, "seeked");
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.set(key, canvas.toDataURL("image/jpeg", 0.62));
    } catch {
      frames.set(key, "");
    }
    pending.delete(key);
    emit();
  }
  pumping = false;
  if (queue.length > 0) void pump();
}
