import { afterEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";

const harness = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  events: null as EventEmitter | null,
  windows: [] as any[],
  root: "", segment: new Uint8Array(), starts: 0, flushes: 0,
  overlay: vi.fn(), toast: vi.fn(),
}));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  const ipc = new EventEmitter(); harness.events = ipc;
  class Window extends EventEmitter {
    static getAllWindows() { return harness.windows.filter((win) => !win.destroyed); }
    static getFocusedWindow() { return null; }
    destroyed = false;
    recording = false;
    options: any;
    webContents = Object.assign(new EventEmitter(), {
      id: harness.windows.length + 1,
      send: (channel: string, value: any) => {
        if (channel === "replay:capture-start") {
          harness.starts++; this.options = value; this.recording = true;
          queueMicrotask(() => ipc.emit("replay:capture-ready", { sender: this.webContents },
            { sessionId: value.sessionId, width: 320, height: 180, audio: true, mic: false, codec: "h264" }));
        }
        if (channel === "replay:capture-flush") {
          harness.flushes++;
          void harness.handlers.get("replay:segment")!({ sender: this.webContents },
            { sessionId: this.options.sessionId, bytes: harness.segment, duration: 1, flushId: value });
        }
        if (channel === "replay:capture-stop") this.recording = false;
      },
    });
    constructor(_options: unknown) { super(); harness.windows.push(this); }
    async loadURL(url: string) { if (!url.startsWith("data:")) queueMicrotask(() => ipc.emit("replay:capture-mounted", { sender: this.webContents })); }
    async loadFile() { queueMicrotask(() => ipc.emit("replay:capture-mounted", { sender: this.webContents })); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit("closed"); }
    setIgnoreMouseEvents() {} setContentProtection() {} hookWindowMessage() {} setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {} showInactive() {} hide() {} isVisible() { return true; } setBounds() {}
  }
  const display = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
  return { BrowserWindow: Window, ipcMain: Object.assign(ipc, { handle: (channel: string, fn: (...args: any[]) => any) => harness.handlers.set(channel, fn) }),
    app: { getPath: () => harness.root }, screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => display, getDisplayMatching: () => display, getAllDisplays: () => [display], on() {}, removeListener() {} },
    session: { defaultSession: { setDisplayMediaRequestHandler() {}, setPermissionRequestHandler() {} } },
    desktopCapturer: { getSources: async () => [] }, dialog: {},
  };
});
vi.mock("./overlayHost", () => ({ bindReplaySaver() {}, registerReplayShortcut: () => true, saveReplayShortcut: async () => {}, setTrayTooltip() {}, setTrayRecording() {}, openOverlay() {}, openOverlayFile: harness.overlay, withOverlayRelaxed: async (_win: unknown, task: () => Promise<unknown>) => task() }));
vi.mock("./replayToast", () => ({ showReplayToast: harness.toast, dismissReplayToast() {} }));
vi.mock("./ffmpeg", () => ({ ffmpegBinary: () => ffmpeg }));

import { initSettings, patchSettings } from "./settings";
import { initReplay, stopReplay } from "./replayHost";

afterEach(async () => { stopReplay(); await new Promise((resolve) => setTimeout(resolve, 30)); if (harness.root) await fs.rm(harness.root, { recursive: true, force: true }); });

it("auto-starts, flushes the newest frames, saves a playable MP4 and opens that replay in overlay", async () => {
  if (!ffmpeg) throw new Error("FFmpeg is required for replay integration coverage");
  harness.root = await fs.mkdtemp(path.join(os.tmpdir(), "lumen-replay-host-"));
  const fixture = path.join(harness.root, "fixture.mkv");
  const made = spawnSync(ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "libopus", fixture], { windowsHide: true });
  expect(made.status, made.stderr.toString()).toBe(0);
  harness.segment = new Uint8Array(await fs.readFile(fixture));
  await initSettings(harness.root); await patchSettings({ replayDirectory: path.join(harness.root, "saved"), replayMic: false });
  initReplay(path.join(harness.root, "buffer"));
  const status = () => harness.handlers.get("replay:status")!();
  await vi.waitFor(() => expect(status().ready).toBe(true));
  expect(status().armed).toBe(true); expect(harness.starts).toBe(1);
  await harness.handlers.get("replay:update")!({}, { replaySeconds: 73 });
  expect(status().seconds).toBe(73); expect(harness.starts).toBe(1);
  // There are no completed segments before Save. The flush must provide the footage.
  expect(status().bufferBytes).toBe(0);
  // Simulate a button event delivered half a second late: no future half-second in the file.
  const saved = await harness.handlers.get("replay:save")!({}, Date.now() - 500);
  expect(harness.flushes).toBe(1); expect(saved.notice).toBe("Saved.");
  expect(harness.toast).toHaveBeenCalledWith(); expect(harness.toast).toHaveBeenCalledWith(true);
  expect((await fs.stat(saved.lastFile)).size).toBeGreaterThan(1000);
  const decode = spawnSync(ffmpeg, ["-v", "error", "-i", saved.lastFile, "-f", "null", "-"], { windowsHide: true });
  expect(decode.status, decode.stderr.toString()).toBe(0);
  const probe = spawnSync(ffmpeg, ["-hide_banner", "-i", saved.lastFile], { windowsHide: true });
  const duration = /Duration: 00:00:(\d+\.\d+)/.exec(probe.stderr.toString());
  expect(duration).not.toBeNull();
  expect(Number(duration![1])).toBeLessThan(.7);
  expect(await fs.readdir(path.dirname(saved.lastFile))).toEqual([path.basename(saved.lastFile)]);
  await harness.handlers.get("replay:open")!(); expect(harness.overlay).toHaveBeenCalledWith(saved.lastFile);
  await harness.handlers.get("replay:update")!({}, { replayMicGain: 1.4 });
  expect(harness.starts).toBe(2); expect(status().bufferBytes).toBe(0);
  await harness.handlers.get("replay:arm")!({}, false);
  expect(status().armed).toBe(false);
}, 15000);
