import path from "node:path";
import { BrowserWindow, ipcMain, screen } from "electron";
import koffi from "koffi";
import type { PerfDisplay, PerfPlacement, PerfSample, Settings } from "@shared/contracts";
import {
  clampPerf,
  cpuPercent,
  fpsFromCounts,
  gpuPercent,
  perfOpacityOf,
  perfScaleOf,
  perfSize,
  placePerf,
  ramPercent,
  type CpuTimes,
} from "@shared/perf";
import {
  endPerfTrace,
  flushPerfTrace,
  perfFrameCount,
  setPerfTarget,
  startPerfTrace,
} from "./perfTrace";
import { getSettings } from "./settings";

const PDH_DOUBLE = 0x00000200;

const user32 = koffi.load("user32.dll");
const kernel = koffi.load("kernel32.dll");
const pdh = koffi.load("pdh.dll");
const foregroundWindow = user32.func("uintptr_t __stdcall GetForegroundWindow()");
const windowPid = user32.func(
  "uint32 __stdcall GetWindowThreadProcessId(uintptr_t hwnd, _Out_ uint32 *pid)",
);
const systemTimes = kernel.func(
  "bool __stdcall GetSystemTimes(void *idle, void *kernelTime, void *user)",
);
const memoryStatus = kernel.func("bool __stdcall GlobalMemoryStatusEx(void *status)");
const openQuery = pdh.func(
  "uint32 __stdcall PdhOpenQueryW(void *src, uintptr_t user, _Out_ void **query)",
);
const addCounter = pdh.func(
  "uint32 __stdcall PdhAddEnglishCounterW(void *query, str16 path, uintptr_t user," +
  " _Out_ void **counter)",
);
const collectQuery = pdh.func("uint32 __stdcall PdhCollectQueryData(void *query)");
const counterArray = pdh.func(
  "uint32 __stdcall PdhGetFormattedCounterArrayW(void *counter, uint32 format," +
  " _Inout_ uint32 *size, _Out_ uint32 *count, _Out_ void *buffer)",
);
const closeQuery = pdh.func("uint32 __stdcall PdhCloseQuery(void *query)");

let win: BrowserWindow | null = null;
let setup: BrowserWindow | null = null;
let timer: NodeJS.Timeout | null = null;
let query: unknown = null;
let counter: unknown = null;
let scratch = Buffer.alloc(0);
let lastCpu: CpuTimes | null = null;
let lastFrames = 0;
let lastAt = 0;
let haveFrames = false;
let targetPid = 0;
const idleTime = Buffer.alloc(8);
const kernelTime = Buffer.alloc(8);
const userTime = Buffer.alloc(8);
const memory = Buffer.alloc(64);
memory.writeUInt32LE(64, 0);

function rendererUrl(): string | null {
  const dev = process.env.ELECTRON_RENDERER_URL;
  return dev ? `${dev}#/perf` : null;
}

function areas(): { x: number; y: number; width: number; height: number }[] {
  return screen.getAllDisplays().map((display) => display.bounds);
}

function frameOf(settings: Settings): PerfPlacement & { width: number; height: number } {
  const size = perfSize(settings.perfScale);
  const scale = perfScaleOf(settings.perfScale);
  const opacity = perfOpacityOf(settings.perfOpacity);
  if (settings.perfBounds) {
    const moved = clampPerf(settings.perfBounds.x, settings.perfBounds.y, size, areas());
    return { x: moved.x, y: moved.y, width: size.width, height: size.height, scale, opacity };
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const origin = placePerf(null, display.bounds, size);
  return { x: origin.x, y: origin.y, width: size.width, height: size.height, scale, opacity };
}

function listDisplays(): PerfDisplay[] {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    primary: display.id === primary,
  }));
}

function readPlacement(value: unknown): PerfPlacement | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PerfPlacement>;
  if (typeof raw.x !== "number" || typeof raw.y !== "number") return null;
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  const scale = perfScaleOf(raw.scale);
  const opacity = perfOpacityOf(raw.opacity);
  const size = perfSize(scale);
  const moved = clampPerf(raw.x, raw.y, size, areas());
  return { x: moved.x, y: moved.y, scale, opacity };
}

function hwndOf(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(value);
  if (Buffer.isBuffer(value) && value.length >= 8) return value.readBigUInt64LE(0);
  return 0n;
}

function foregroundPid(): number {
  try {
    const hwnd = hwndOf(foregroundWindow());
    if (hwnd === 0n) return 0;
    const pid = [0];
    windowPid(hwnd, pid);
    return pid[0] >>> 0;
  } catch (error) {
    console.error("performance foreground", error);
    return 0;
  }
}

function readCpu(): CpuTimes | null {
  try {
    if (!systemTimes(idleTime, kernelTime, userTime)) return null;
  } catch (error) {
    console.error("performance processor", error);
    return null;
  }
  return {
    idle: idleTime.readBigUInt64LE(0),
    kernel: kernelTime.readBigUInt64LE(0),
    user: userTime.readBigUInt64LE(0),
  };
}

function ensureGpu(): boolean {
  if (query && counter) return true;
  try {
    const opened: unknown[] = [null];
    if (openQuery(null, 0, opened) !== 0 || !opened[0]) return false;
    const added: unknown[] = [null];
    const path = "\\GPU Engine(*)\\Utilization Percentage";
    if (addCounter(opened[0], path, 0, added) !== 0 || !added[0]) {
      closeQuery(opened[0]);
      return false;
    }
    query = opened[0];
    counter = added[0];
    collectQuery(query);
    return true;
  } catch (error) {
    console.error("performance graphics", error);
    return false;
  }
}

function counterName(buffer: Buffer, origin: bigint, namePtr: bigint): string {
  const offset = Number(namePtr - origin);
  if (offset < 0 || offset + 2 > buffer.length) return "";
  let end = offset;
  while (end + 1 < buffer.length && buffer.readUInt16LE(end) !== 0 && end - offset < 240) {
    end += 2;
  }
  return buffer.toString("utf16le", offset, end);
}

function readGpu(): number | null {
  if (!ensureGpu() || !counter) return null;
  try {
    if (collectQuery(query) !== 0) return null;
    const size = [0];
    const count = [0];
    counterArray(counter, PDH_DOUBLE, size, count, null);
    if (size[0] <= 0 || size[0] > 8_000_000) return null;
    if (scratch.length < size[0]) scratch = Buffer.alloc(size[0] + 256);
    const used = [scratch.length];
    const rows = [0];
    if (counterArray(counter, PDH_DOUBLE, used, rows, scratch) !== 0) return null;
    const origin = koffi.address(scratch);
    const parsed: { name: string; value: number }[] = [];
    const total = Math.min(rows[0], 4000);
    for (let index = 0; index < total; index += 1) {
      const base = index * 24;
      if (scratch.readUInt32LE(base + 8) !== 0) continue;
      parsed.push({
        name: counterName(scratch, origin, scratch.readBigUInt64LE(base)),
        value: scratch.readDoubleLE(base + 16),
      });
    }
    return gpuPercent(parsed);
  } catch (error) {
    console.error("performance graphics", error);
    return null;
  }
}

function readRam(): number | null {
  try {
    if (!memoryStatus(memory)) return null;
  } catch (error) {
    console.error("performance memory", error);
    return null;
  }
  return ramPercent(memory.readUInt32LE(4));
}

function publish(): void {
  const now = Date.now();
  const cpu = readCpu();
  const cpuValue = lastCpu && cpu ? cpuPercent(lastCpu, cpu) : null;
  if (cpu) lastCpu = cpu;
  const pid = foregroundPid();
  let fps: number | null = null;
  if (pid !== targetPid) {
    targetPid = pid;
    setPerfTarget(pid);
    lastFrames = perfFrameCount();
    lastAt = now;
    haveFrames = true;
  } else {
    flushPerfTrace();
    const frames = perfFrameCount();
    fps = haveFrames ? fpsFromCounts(lastFrames, frames, now - lastAt) : null;
    lastFrames = frames;
    lastAt = now;
    haveFrames = true;
  }
  const sample: PerfSample = { fps, cpu: cpuValue, gpu: readGpu(), ram: readRam() };
  for (const current of BrowserWindow.getAllWindows()) {
    if (current.isDestroyed()) continue;
    if (!current.webContents.getURL().includes("#/perf")) continue;
    current.webContents.send("perf:sample", sample);
  }
}

function startSampler(): void {
  startPerfTrace();
  if (timer) return;
  targetPid = foregroundPid();
  setPerfTarget(targetPid);
  haveFrames = false;
  timer = setInterval(publish, 500);
}

function stopSampler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  endPerfTrace();
  lastCpu = null;
  haveFrames = false;
  targetPid = 0;
  if (query) {
    try {
      closeQuery(query);
    } catch (error) {
      console.error("performance graphics", error);
    }
  }
  query = null;
  counter = null;
}

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  const origin = frameOf(getSettings());
  const created = new BrowserWindow({
    x: origin.x,
    y: origin.y,
    width: origin.width,
    height: origin.height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win = created;
  created.setAlwaysOnTop(true, "screen-saver");
  created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  created.setIgnoreMouseEvents(true);
  created.webContents.setBackgroundThrottling(false);
  created.on("closed", () => {
    if (win === created) win = null;
  });
  const dev = rendererUrl();
  if (dev) void created.loadURL(dev);
  else {
    void created.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "/perf" });
  }
  return created;
}

function pushLook(scale: number, opacity: number): void {
  const overlay = win;
  if (!overlay || overlay.isDestroyed()) return;
  overlay.webContents.send("perf:look", {
    scale: perfScaleOf(scale),
    opacity: perfOpacityOf(opacity),
  });
}

function previewPlacement(value: unknown): void {
  const next = readPlacement(value);
  const overlay = win;
  if (!next || !overlay || overlay.isDestroyed() || !overlay.isVisible()) return;
  const size = perfSize(next.scale);
  const bounds = { x: next.x, y: next.y, width: size.width, height: size.height };
  const current = overlay.getBounds();
  const moved = current.x !== bounds.x || current.y !== bounds.y
    || current.width !== bounds.width || current.height !== bounds.height;
  if (moved) overlay.setBounds(bounds);
  pushLook(next.scale, next.opacity);
}

function loadSetup(target: BrowserWindow): void {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) void target.loadURL(`${dev}#/perf-setup`);
  else {
    void target.loadFile(path.join(__dirname, "../renderer/index.html"), {
      hash: "/perf-setup",
    });
  }
}

/** Opens the placement window. A second call brings the same one forward. */
export function openPerfSettings(): void {
  if (setup && !setup.isDestroyed()) {
    if (setup.isMinimized()) setup.restore();
    setup.show();
    setup.focus();
    return;
  }
  const created = new BrowserWindow({
    width: 640,
    height: 500,
    minWidth: 600,
    minHeight: 440,
    frame: false,
    show: false,
    title: "Performance",
    backgroundColor: "#12110f",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  setup = created;
  created.on("closed", () => {
    if (setup === created) setup = null;
  });
  created.once("ready-to-show", () => {
    if (created.isDestroyed()) return;
    created.show();
    created.focus();
  });
  loadSetup(created);
}

export function perfWindow(action: "minimize" | "maximize" | "close"): void {
  if (!setup || setup.isDestroyed()) return;
  if (action === "minimize") setup.minimize();
  else if (action === "maximize") {
    if (setup.isMaximized()) setup.unmaximize();
    else setup.maximize();
  } else setup.close();
}

export function applyPerf(settings: Settings): void {
  if (!settings.perfEnabled) {
    stopSampler();
    if (win && !win.isDestroyed()) win.hide();
    return;
  }
  const overlay = ensureWindow();
  const sized = perfSize(settings.perfScale);
  const current = overlay.getBounds();
  const kept = !settings.perfBounds && overlay.isVisible()
    ? clampPerf(current.x, current.y, sized, areas())
    : null;
  const frame = kept
    ? {
      x: kept.x,
      y: kept.y,
      width: sized.width,
      height: sized.height,
      scale: perfScaleOf(settings.perfScale),
      opacity: perfOpacityOf(settings.perfOpacity),
    }
    : frameOf(settings);
  const moved = current.x !== frame.x || current.y !== frame.y
    || current.width !== frame.width || current.height !== frame.height;
  if (moved) {
    overlay.setBounds({
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    });
  }
  if (!overlay.isVisible()) overlay.showInactive();
  overlay.setIgnoreMouseEvents(true);
  overlay.setAlwaysOnTop(true, "screen-saver");
  pushLook(frame.scale, frame.opacity);
  startSampler();
}

export function initPerf(): void {
  ipcMain.handle("perf:open", () => openPerfSettings());
  ipcMain.handle("perf:window", (_event, action: unknown) => {
    const next = action === "minimize" || action === "maximize" ? action : "close";
    perfWindow(next);
  });
  ipcMain.handle("perf:displays", () => listDisplays());
  ipcMain.handle("perf:frame", () => {
    const settings = getSettings();
    const live = win && !win.isDestroyed() && win.isVisible() ? win.getBounds() : null;
    if (live && !settings.perfBounds) {
      return {
        x: live.x,
        y: live.y,
        scale: perfScaleOf(settings.perfScale),
        opacity: perfOpacityOf(settings.perfOpacity),
      };
    }
    const frame = frameOf(settings);
    return { x: frame.x, y: frame.y, scale: frame.scale, opacity: frame.opacity };
  });
  ipcMain.on("perf:place", (_event, value: unknown) => previewPlacement(value));
  applyPerf(getSettings());
}

export function stopPerf(): void {
  stopSampler();
  if (win && !win.isDestroyed()) win.hide();
}
