import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  screen,
  session,
} from "electron";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ReplayCaptureOptions, ReplayStatus, ReplaySegment, ReplayCaptureInfo } from "@shared/contracts";
import {
  buildSaveArgs,
  concatLine,
  pictureBroken,
  replayBuffer,
  replayFileName,
  replayFps,
  replayHeight,
  replayGain, replayBitrate, replayDevice,
} from "@shared/replay";
import { showReplayToast, dismissReplayToast } from "./replayToast";
import { ReplayStore } from "./replayStore";
import { ffmpegBinary } from "./ffmpeg";
import {
  bindReplaySaver,
  openOverlay,
  openOverlayFile,
  registerReplayShortcut,
  saveReplayShortcut,
  setTrayRecording,
  setTrayTooltip,
  withOverlayRelaxed,
} from "./overlayHost";
import { getSettings, patchSettings } from "./settings";
import { indicatorBounds, RECORDING_INDICATOR_HTML } from "@shared/recordingIndicator";

let bufferDir = "";
let capture: BrowserWindow | null = null;
let dot: BrowserWindow | null = null;
let store: ReplayStore;
let ready = false;
let captureWidth = 0;
let captureHeight = 0;
let operation: Promise<unknown> = Promise.resolve();
let pendingFlush: { id: string; finish: () => void } | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let armed = false;
let saving = false;
let saveRequested = false;
let notice: string | null = null;
let lastFile: string | null = null;
let encoder = "Screen";
let captureDisplayId: number | null = null;

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = operation.then(task, task);
  operation = next.catch(() => undefined);
  return next;
}

function releaseCapture(): void {
  if (capture && !capture.isDestroyed()) capture.destroy();
  capture = null;
}

function outputDirectory(): string {
  const chosen = getSettings().replayDirectory;
  if (chosen) return chosen;
  try {
    return path.join(app.getPath("videos"), "Lumen");
  } catch {
    return path.join(app.getPath("userData"), "replays");
  }
}

function status(): ReplayStatus {
  const settings = getSettings();
  return {
    armed,
    saving,
    seconds: settings.replaySeconds,
    autoStart: settings.replayAutoStart,
    captureWidth, captureHeight,
    fps: settings.replayFps,
    height: settings.replayHeight,
    mic: settings.replayMic,
    micDeviceId: settings.replayMicDeviceId,
    micGain: settings.replayMicGain,
    systemAudio: settings.replaySystemAudio,
    systemGain: settings.replaySystemGain,
    noiseSuppression: settings.replayNoiseSuppression,
    echoCancellation: settings.replayEchoCancellation,
    bitrateKbps: settings.replayBitrateKbps,
    bufferedSeconds: Math.min(settings.replaySeconds, store?.seconds ?? 0),
    bufferBytes: store?.bytes ?? 0,
    ready,
    shortcut: settings.replayAccelerator,
    directory: outputDirectory(),
    encoder,
    notice,
    lastFile,
  };
}

function publish(): void {
  const payload = status();
  setTrayRecording(armed);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("replay:status", payload);
  }
}

function anchorDot(): void {
  if (!dot || dot.isDestroyed()) return;
  const display = screen.getDisplayMatching(dot.getBounds());
  const area = display.workArea ?? display.bounds;
  dot.setBounds(indicatorBounds(area));
}

function hideDot(): void {
  screen.removeListener("display-metrics-changed", anchorDot);
  if (dot && !dot.isDestroyed()) dot.destroy();
  dot = null;
}

function showDot(): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea ?? display.bounds;
  const bounds = indicatorBounds(area);
  if (!dot || dot.isDestroyed()) {
    dot = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    dot.setContentProtection(true);
    dot.hookWindowMessage(0x0202, () => {
      setImmediate(() => openOverlay());
    });
    void dot.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(RECORDING_INDICATOR_HTML)}`);
    screen.removeListener("display-metrics-changed", anchorDot);
    screen.on("display-metrics-changed", anchorDot);
  } else {
    dot.setBounds(bounds);
  }
  dot.setAlwaysOnTop(true, "screen-saver");
  dot.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  dot.showInactive();
}

function codecLabel(codec: string): string {
  if (codec.includes("h264")) return "H.264";
  if (codec.includes("vp9")) return "VP9";
  if (codec.includes("vp8")) return "VP8";
  return "Screen";
}

function isCapture(senderId: number): boolean {
  return Boolean(capture && !capture.isDestroyed() && capture.webContents.id === senderId);
}

function clearBuffer(): void {
  void store?.stop().catch(() => undefined);
}

function captureOptions(): ReplayCaptureOptions {
  const settings = getSettings();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  captureDisplayId = display.id;
  return { sessionId: store.sessionId, sourceWidth: display.bounds.width * display.scaleFactor,
    sourceHeight: display.bounds.height * display.scaleFactor, fps: settings.replayFps, height: settings.replayHeight, mic: settings.replayMic,
    micDeviceId: settings.replayMicDeviceId, micGain: settings.replayMicGain,
    systemAudio: settings.replaySystemAudio, systemGain: settings.replaySystemGain,
    noiseSuppression: settings.replayNoiseSuppression, echoCancellation: settings.replayEchoCancellation,
    bitrateKbps: settings.replayBitrateKbps };
}

function tellCapture(
  channel: "replay:capture-start" | "replay:capture-stop",
  options?: ReplayCaptureOptions,
): void {
  if (!capture || capture.isDestroyed()) return;
  if (options) capture.webContents.send(channel, options);
  else capture.webContents.send(channel);
}

async function ensureCapture(): Promise<BrowserWindow> {
  if (capture && !capture.isDestroyed()) return capture;
  const win = new BrowserWindow({
    show: false,
    width: 320,
    height: 180,
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  capture = win;
  win.on("closed", () => {
    if (capture === win) {
      capture = null;
      if (armed) fail("Capture closed unexpectedly. Start replay to resume buffering.");
    }
  });
  win.webContents.on("render-process-gone", () => {
    if (capture === win && armed) fail("Capture stopped unexpectedly. Start replay to resume buffering.");
  });
  const dev = process.env.ELECTRON_RENDERER_URL;
  let cleanupMounted = (): void => undefined;
  const loaded = new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => { ipcMain.removeListener("replay:capture-mounted", done); reject(new Error("Capture did not start. Try again.")); }, 8000);
    const done = (event: Electron.IpcMainEvent): void => {
      if (event.sender.id !== win.webContents.id) return;
      clearTimeout(deadline); ipcMain.removeListener("replay:capture-mounted", done); resolve();
    };
    ipcMain.on("replay:capture-mounted", done);
    cleanupMounted = () => { clearTimeout(deadline); ipcMain.removeListener("replay:capture-mounted", done); };
  });
  try {
    await Promise.all([loaded, dev ? win.loadURL(`${dev}#/replay-capture`)
      : win.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "/replay-capture" })]);
  } finally { cleanupMounted(); }
  return win;
}

async function prune(): Promise<void> {
  if (armed) await store.prune(getSettings().replaySeconds);
}

function picturePlays(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(ffmpegBinary(), ["-v", "error", "-i", file, "-map", "0:v:0", "-f", "null", "-"], { windowsHide: true });
    } catch {
      resolve(false);
      return;
    }
    let err = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      err += String(chunk);
    });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0 && !pictureBroken(err)));
  });
}

function runSave(files: string[], output: string, copy: boolean, duration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const listPath = path.join(bufferDir, "save.txt");
    const body = files.map(concatLine).join("\n");
    void fs.writeFile(listPath, body, "utf8").then(() => {
      let proc;
      try {
        proc = spawn(ffmpegBinary(), buildSaveArgs(listPath, output, copy, duration), { windowsHide: true });
      } catch {
        reject(new Error("ffmpeg is not available"));
        return;
      }
      let err = "";
      let decodeFailed = false;
      proc.stderr?.on("data", (chunk: Buffer) => {
        err = (err + String(chunk)).slice(-500);
        decodeFailed ||= /Error (?:submitting|decoding|parsing)|Decoding error|Invalid data found|Error while decoding/i.test(err);
      });
      proc.on("error", () => reject(new Error("ffmpeg is not available")));
      proc.on("close", (code) => {
        if (code === 0 && !decodeFailed) resolve();
        else reject(new Error(err.trim() || "Could not save the replay."));
      });
    }, reject);
  });
}

async function freePath(filePath: string): Promise<string> {
  const parsed = path.parse(filePath);
  let candidate = filePath;
  for (let n = 2; n < 100; n += 1) {
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
    candidate = path.join(parsed.dir, `${parsed.name}-${n}${parsed.ext}`);
  }
  return candidate;
}

function fail(message: string): void {
  armed = false;
  ready = false;
  tellCapture("replay:capture-stop");
  hideDot();
  notice = message;
  releaseCapture();
  if (!saving) clearBuffer();
  showReplayToast(true);
  publish();
}

async function arm(): Promise<void> {
  if (armed) return;
  await writeQueue.catch(() => undefined);
  await store.start();
  ready = false;
  captureWidth = 0; captureHeight = 0;
  notice = null;
  await ensureCapture();
  armed = true;
  showDot();
  tellCapture("replay:capture-start", captureOptions());
  publish();
}

function disarm(): void {
  if (saving) {
    notice = "Wait for the save to finish.";
    publish();
    return;
  }
  armed = false;
  ready = false;
  tellCapture("replay:capture-stop");
  hideDot();
  notice = null;
  clearBuffer();
  releaseCapture();
  publish();
}

async function restart(): Promise<void> {
  tellCapture("replay:capture-stop");
  ready = false;
  captureWidth = 0; captureHeight = 0;
  await writeQueue;
  await store.start();
  tellCapture("replay:capture-start", captureOptions());
  publish();
}

async function saveReplay(cutoff: number, sessionId: string): Promise<void> {
  if (!armed) {
    notice = "Replay is off.";
    showReplayToast(true);
    publish();
    return;
  }
  if (saving) return;
  saving = true;
  notice = null;
  showReplayToast();
  let release = (): void => undefined;
  let savedFlash = false;
  publish();
  try {
    if (store.sessionId !== sessionId) throw new Error("The buffer restarted before this save. Try saving again.");
    // Finalize the in-flight slice so Save includes the moment of the keypress.
    if (!ready) throw new Error("Capture is still starting. Try saving again in a moment.");
    if (capture && !capture.isDestroyed()) await new Promise<void>((resolve, reject) => {
      const id = `${Date.now()}`;
      const deadline = setTimeout(() => { pendingFlush = null; reject(new Error("Capture did not finish the latest frames. Try again.")); }, 6000);
      pendingFlush = { id, finish: () => { clearTimeout(deadline); pendingFlush = null; resolve(); } };
      capture!.webContents.send("replay:capture-flush", id);
    });
    const snapshot = store.snapshot(getSettings().replaySeconds, cutoff);
    release = snapshot.release;
    const files = snapshot.segments.map((item) => item.file);
    if (files.length === 0) throw new Error("Nothing to save yet. Give it a few seconds.");
    const dir = outputDirectory();
    await fs.mkdir(dir, { recursive: true });
    const output = await freePath(path.join(dir, replayFileName(new Date())));
    const temporary = `${output}.partial.mp4`;
    try {
      let copied = true;
      try { await runSave(files, temporary, true, snapshot.duration); }
      catch {
        copied = false;
        await fs.rm(temporary, { force: true }).catch(() => undefined);
        await runSave(files, temporary, false, snapshot.duration);
      }
      if (copied && !(await picturePlays(temporary))) {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
        await runSave(files, temporary, false, snapshot.duration);
      }
      await fs.rename(temporary, output);
    } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
    lastFile = output;
    notice = "Saved.";
    savedFlash = true;
  } catch (error) {
    notice = error instanceof Error ? error.message : "Could not save the replay.";
  } finally {
    release();
    saving = false;
    showReplayToast(true);
    await prune().catch(() => undefined);
    if (!armed) clearBuffer();
    publish();
    if (savedFlash) {
      setTrayTooltip("Lumen — saved");
      setTimeout(() => setTrayTooltip(armed ? "Lumen — recording" : "Lumen"), 2500);
    }
  }
}

async function requestSave(requestedAt?: unknown): Promise<ReplayStatus> {
  if (saveRequested) return status();
  saveRequested = true;
  const now = Date.now();
  const cutoff = typeof requestedAt === "number" && Number.isFinite(requestedAt) ? Math.min(now, Math.max(now - 10000, requestedAt)) : now;
  const sessionId = store.sessionId;
  // Hold the already recorded beginning while the latest segment is flushed/written.
  const held = store.snapshot(getSettings().replaySeconds, cutoff);
  try { await serialize(() => saveReplay(cutoff, sessionId)); return status(); }
  finally { held.release(); saveRequested = false; await prune().catch(() => undefined); }
}

function installCaptureHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    const point = screen.getCursorScreenPoint();
    const display = screen.getAllDisplays().find((item) => item.id === captureDisplayId) ?? screen.getDisplayNearestPoint(point);
    void desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 0, height: 0 },
    }).then((sources) => {
      const match = sources.find((source) => source.display_id === String(display.id))
        ?? sources[0];
      if (!match) {
        callback({});
        return;
      }
      callback({ video: match, ...(getSettings().replaySystemAudio ? { audio: "loopback" as const } : {}) });
    }).catch(() => callback({}));
  }, { useSystemPicker: false });
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "display-capture");
  });
}

export function stopReplay(): void {
  if (!bufferDir) return;
  armed = false;
  ready = false;
  tellCapture("replay:capture-stop");
  hideDot();
  clearBuffer();
  releaseCapture();
  dismissReplayToast();
}

export function initReplay(dir: string): void {
  bufferDir = dir;
  store = new ReplayStore(dir);
  installCaptureHandler();
  bindReplaySaver(() => {
    void requestSave();
  });
  const settings = getSettings();
  if (!registerReplayShortcut(settings.replayAccelerator)) {
    console.error("replay shortcut unavailable", settings.replayAccelerator);
  }

  ipcMain.handle("replay:segment", async (event, segment: ReplaySegment) => {
    if (!armed || !isCapture(event.sender.id)) return;
    if (!segment || segment.sessionId !== store.sessionId || !(segment.bytes instanceof Uint8Array)) return;
    writeQueue = writeQueue.catch(() => undefined).then(async () => {
      if (segment.bytes.length > 0) await store.append(segment.sessionId, segment.bytes, segment.duration, segment.startedAt, segment.endedAt);
      await prune();
      if (pendingFlush && pendingFlush.id === segment.flushId) pendingFlush.finish();
      publish();
    });
    try { await writeQueue; } catch { fail("Replay stopped because its temporary buffer could not be written."); }
  });
  ipcMain.on(
    "replay:capture-ready",
    (event, info: ReplayCaptureInfo) => {
    if (!isCapture(event.sender.id)) return;
    if (!armed || info?.sessionId !== store.sessionId) return;
    ready = true;
    captureWidth = info.width; captureHeight = info.height;
    encoder = codecLabel(String(info?.codec ?? ""));
    if (getSettings().replaySystemAudio && !info?.audio) notice = "System audio is unavailable. Other selected sources are still recording.";
    else if (getSettings().replayMic && !info.mic) notice = "No microphone was found.";
    else notice = null;
    publish();
  });
  ipcMain.on("replay:capture-failed", (event, message: unknown) => {
    if (!isCapture(event.sender.id)) return;
    fail(typeof message === "string" && message.trim() ? message : "Replay failed.");
  });

  ipcMain.handle("replay:open", async () => { if (lastFile) { await fs.access(lastFile); dismissReplayToast(); openOverlayFile(lastFile); } });
  ipcMain.on("replay:dismiss", dismissReplayToast);
  ipcMain.handle("replay:status", () => status());
  ipcMain.handle("replay:arm", (_event, on: unknown) => serialize(async () => {
    try {
      if (on === true) await arm();
      else disarm();
    } catch (error) {
      fail(error instanceof Error ? error.message : "Replay failed.");
    }
    return status();
  }));
  ipcMain.handle("replay:save", (_event, requestedAt: unknown) => requestSave(requestedAt));
  ipcMain.handle("replay:update", (_event, patch: unknown) => serialize(async () => {
    if (saving) {
      notice = "Wait for the save to finish.";
      publish();
      return status();
    }
    const next = patch && typeof patch === "object" ? patch as Record<string, unknown> : {};
    const current = getSettings();
    const fpsChanged = next.replayFps !== undefined
      && replayFps(next.replayFps) !== current.replayFps;
    const heightChanged = next.replayHeight !== undefined &&
      replayHeight(next.replayHeight) !== current.replayHeight;
    const micChanged = typeof next.replayMic === "boolean" && next.replayMic !== current.replayMic;
    const audio = {
      replayMicDeviceId: next.replayMicDeviceId === undefined ? current.replayMicDeviceId : replayDevice(next.replayMicDeviceId),
      replayMicGain: next.replayMicGain === undefined ? current.replayMicGain : replayGain(next.replayMicGain),
      replaySystemAudio: typeof next.replaySystemAudio === "boolean" ? next.replaySystemAudio : current.replaySystemAudio,
      replaySystemGain: next.replaySystemGain === undefined ? current.replaySystemGain : replayGain(next.replaySystemGain),
      replayNoiseSuppression: typeof next.replayNoiseSuppression === "boolean" ? next.replayNoiseSuppression : current.replayNoiseSuppression,
      replayEchoCancellation: typeof next.replayEchoCancellation === "boolean" ? next.replayEchoCancellation : current.replayEchoCancellation,
      replayBitrateKbps: next.replayBitrateKbps === undefined ? current.replayBitrateKbps : replayBitrate(next.replayBitrateKbps),
    };
    const audioChanged = (Object.keys(audio) as (keyof typeof audio)[]).some((key) => audio[key] !== current[key]);
    await patchSettings({
      ...audio,
      replayAutoStart: typeof next.replayAutoStart === "boolean" ? next.replayAutoStart : current.replayAutoStart,
      replaySeconds: next.replaySeconds === undefined
        ? current.replaySeconds
        : replayBuffer(next.replaySeconds),
      replayFps: fpsChanged ? replayFps(next.replayFps) : current.replayFps,
      replayHeight: heightChanged ? replayHeight(next.replayHeight) : current.replayHeight,
      replayMic: micChanged ? next.replayMic === true : current.replayMic,
    });
    try {
      if (armed && (fpsChanged || heightChanged || micChanged || audioChanged)) await restart();
      else { await prune(); publish(); }
    } catch (error) {
      fail(error instanceof Error ? error.message : "Replay failed.");
    }
    return status();
  }));
  ipcMain.handle("replay:shortcut", async (_event, accelerator: unknown) => {
    await saveReplayShortcut(String(accelerator ?? ""));
    publish();
    return status();
  });
  if (settings.replayAutoStart) void serialize(arm).catch((error) => {
    fail(error instanceof Error ? error.message : "Automatic replay could not start.");
    showReplayToast(true);
  });

  ipcMain.handle("replay:folder", async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await withOverlayRelaxed(win, () => (
      win
        ? dialog.showOpenDialog(win, { properties: ["openDirectory"] })
        : dialog.showOpenDialog({ properties: ["openDirectory"] })
    ));
    if (!result.canceled && result.filePaths[0]) {
      await patchSettings({ replayDirectory: result.filePaths[0] });
      publish();
    }
    return status();
  });
}
