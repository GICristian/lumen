import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReplayStore } from "./replayStore";
import { normalizeSettings } from "./settings";

const roots: string[] = [];
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lumen-replay-test-")); roots.push(root);
  const store = new ReplayStore(root); await store.start(); return { store, root };
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("replay buffer ownership", () => {
  it("freezes the requested instant even if later writes have already arrived", async () => {
    const { store } = await setup();
    await store.append(store.sessionId, new Uint8Array(8), 4, 1000, 5000);
    await store.append(store.sessionId, new Uint8Array(8), 4, 5000, 9000);
    const earlier = store.snapshot(60, 7000);
    expect(earlier.segments.map((entry) => entry.duration)).toEqual([4, 2]);
    expect(earlier.duration).toBe(6);
    await store.append(store.sessionId, new Uint8Array(8), 4, 9000, 13000);
    const overlap = store.snapshot(60, 7000);
    earlier.release(); await store.prune(4);
    expect(store.segments.length).toBe(3); // second snapshot still protects the same files
    expect(overlap.duration).toBe(6);
    overlap.release(); await store.prune(4);
    expect(store.segments.length).toBe(1);
  });
  it("uses measured duration, protects saving files, then reclaims them", async () => {
    const { store } = await setup();
    for (const duration of [4, 4, 1]) await store.append(store.sessionId, new Uint8Array(8), duration);
    const saving = store.snapshot(6);
    expect(saving.segments.map((entry) => entry.duration)).toEqual([4, 4, 1]);
    await store.append(store.sessionId, new Uint8Array(10), 4);
    await store.prune(4);
    expect(store.bytes).toBe(34);
    for (const entry of saving.segments) expect((await fs.stat(entry.file)).size).toBe(8);
    saving.release(); await store.prune(4);
    expect(store.seconds).toBe(4); expect(store.bytes).toBe(10);
    await expect(fs.stat(saving.segments[0].file)).rejects.toThrow();
  });
  it("keeps the live header when clusters are pruned", async () => {
    const { store } = await setup();
    await store.append(store.sessionId, new Uint8Array(8), 4, 1000, 5000, new Uint8Array(6), {
      header: new Uint8Array([9, 8, 7, 6]),
      micHeader: new Uint8Array([5, 4]),
      cluster: true,
      micLeadMs: 25,
    });
    expect(store.segments[0].cluster).toBe(true);
    expect(store.micLeadMs).toBe(25);
    expect((await fs.stat(store.videoHeader!)).size).toBe(4);
    expect((await fs.stat(store.micHeader!)).size).toBe(2);
    await store.prune(0);
    expect(store.segments.length).toBe(0);
    expect((await fs.stat(store.videoHeader!)).size).toBe(4);
  });
  it("keeps the microphone beside its picture and deletes both together", async () => {
    const { store } = await setup();
    await store.append(store.sessionId, new Uint8Array(8), 4, 1000, 5000, new Uint8Array(12));
    const [entry] = store.segments;
    expect(entry.micFile).toMatch(/\.mic\.webm$/);
    expect((await fs.stat(entry.micFile!)).size).toBe(12);
    await store.prune(0);
    await expect(fs.stat(entry.file)).rejects.toThrow();
    await expect(fs.stat(entry.micFile!)).rejects.toThrow();
  });
  it("cannot put an old session's late write into a restarted buffer", async () => {
    const { store, root } = await setup(); const old = store.sessionId;
    const pending = store.append(old, new Uint8Array(1024 * 1024), 4);
    await store.stop(); await store.start(); await pending;
    await store.append(old, new Uint8Array(20), 4);
    await store.append(store.sessionId, new Uint8Array(30), 2);
    expect(store.bytes).toBe(30); expect(store.seconds).toBe(2);
    expect(await fs.readdir(root)).toEqual([store.sessionId]);
  });
  it("reclaims crash leftovers without deleting unrelated files", async () => {
    const { store, root } = await setup(); await store.stop();
    await fs.mkdir(path.join(root, "session-abandoned"));
    await fs.writeFile(path.join(root, "keep.txt"), "keep");
    const recovered = new ReplayStore(root); await recovered.start();
    expect((await fs.readdir(root)).sort()).toEqual(["keep.txt", recovered.sessionId].sort());
    await expect(recovered.append(recovered.sessionId, new Uint8Array(1), NaN)).rejects.toThrow("Invalid replay segment");
    expect(recovered.bytes).toBe(0);
  });
});

describe("replay settings migration", () => {
  it("preserves a custom duration and zero gain while making auto-start explicit", () => {
    const settings = normalizeSettings({ replaySeconds: 73, replayMicGain: 0, replayBitrateKbps: 11500, replayMicDeviceId: "usb-mic" });
    expect(settings.replaySeconds).toBe(73); expect(settings.replayMicGain).toBe(0);
    expect(settings.replayMicDeviceId).toBe("usb-mic"); expect(settings.replayBitrateKbps).toBe(11500);
    expect(settings.replayAutoStart).toBe(true);
    expect(normalizeSettings({ replayAutoStart: false }).replayAutoStart).toBe(false);
    expect(normalizeSettings({ replaySeconds: 5000, replayMicGain: Infinity, replayBitrateKbps: -100 }).replaySeconds).toBe(900);
    expect(normalizeSettings({ replayMicGain: Infinity }).replayMicGain).toBe(1);
    expect(normalizeSettings(null).windowMaximized).toBe(true);
    expect(normalizeSettings({ windowMaximized: false }).windowMaximized).toBe(false);
  });
});
