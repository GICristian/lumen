import { promises as fs } from "node:fs";
import path from "node:path";
import { replayTail } from "@shared/replay";
import { webmDuration } from "@shared/webmDuration";
import { normalizeWebmTracks } from "@shared/webmTracks";

export type BufferedSegment = { file: string; duration: number; bytes: number; startedAt: number; endedAt: number };

async function removeTree(target: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOTEMPTY" && code !== "EBUSY" && code !== "EPERM") throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  await fs.rm(target, { recursive: true, force: true });
}

/** Every recording owns its directory. Late writes can never enter a new buffer. */
export class ReplayStore {
  private directory = "";
  private index = 0;
  private entries: BufferedSegment[] = [];
  private protectedFiles = new Map<string, number>();
  private initialized = false;
  constructor(private readonly root: string) {}
  get sessionId(): string { return this.directory ? path.basename(this.directory) : ""; }
  get segments(): readonly BufferedSegment[] { return this.entries; }
  get bytes(): number { return this.entries.reduce((sum, item) => sum + item.bytes, 0); }
  get seconds(): number { return this.entries.reduce((sum, item) => sum + item.duration, 0); }

  async start(): Promise<void> {
    await this.stop();
    await fs.mkdir(this.root, { recursive: true });
    if (!this.initialized) {
      // Only our own session directories; recover disk space left by an interrupted process.
      const old = await fs.readdir(this.root, { withFileTypes: true });
      await Promise.all(old.filter((entry) => entry.isDirectory() && /^session-[\w-]+$/.test(entry.name))
        .map((entry) => removeTree(path.join(this.root, entry.name))));
      this.initialized = true;
    }
    this.directory = await fs.mkdtemp(path.join(this.root, "session-"));
    this.index = 0;
  }
  async stop(): Promise<void> {
    const old = this.directory;
    this.directory = "";
    this.entries = [];
    this.protectedFiles.clear();
    if (old) await removeTree(old);
  }
  async append(sessionId: string, bytes: Uint8Array, duration: number, startedAt = Date.now() - duration * 1000, endedAt = Date.now()): Promise<void> {
    if (!sessionId || sessionId !== this.sessionId) return;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 30 || bytes.length < 1 || bytes.length > 64 * 1024 * 1024) throw new Error("Invalid replay segment");
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) throw new Error("Invalid replay timestamps");
    const mediaDuration = webmDuration(bytes) ?? duration;
    const file = path.join(this.directory, `seg_${String(this.index++).padStart(9, "0")}.webm`);
    const part = `${file}.part`;
    try {
      await fs.writeFile(part, normalizeWebmTracks(bytes));
      await fs.rename(part, file);
      if (sessionId === this.sessionId) this.entries.push({ file, bytes: bytes.length, duration: mediaDuration, startedAt, endedAt });
      else await fs.rm(file, { force: true });
    } catch (error) {
      if (sessionId === this.sessionId) throw error;
    }
  }
  async prune(seconds: number): Promise<void> {
    const keep = new Set(replayTail(this.entries, seconds).map((item) => item.file));
    const remove = this.entries.filter((item) => !keep.has(item.file) && !this.protectedFiles.has(item.file));
    const removed = new Set(remove.map((item) => item.file));
    this.entries = this.entries.filter((item) => !removed.has(item.file));
    await Promise.all(remove.map((item) => fs.rm(item.file, { force: true })));
  }
  snapshot(seconds: number, cutoff = Infinity): { segments: BufferedSegment[]; duration: number; release: () => void } {
    // A save owns a fixed point in time. New writes cannot extend it into the future.
    const eligible = this.entries.filter((item) => item.startedAt < cutoff).map((item) => ({ ...item,
      duration: Math.max(0, item.duration - Math.max(0, (item.endedAt - cutoff) / 1000)),
    })).filter((item) => item.duration > .001);
    const segments = replayTail(eligible, seconds);
    for (const item of segments) this.protectedFiles.set(item.file, (this.protectedFiles.get(item.file) ?? 0) + 1);
    let released = false;
    return { segments, duration: segments.reduce((sum, item) => sum + item.duration, 0), release: () => {
      if (released) return; released = true;
      for (const item of segments) {
        const remaining = (this.protectedFiles.get(item.file) ?? 0) - 1;
        if (remaining > 0) this.protectedFiles.set(item.file, remaining); else this.protectedFiles.delete(item.file);
      }
    } };
  }
}
