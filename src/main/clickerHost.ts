import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { BrowserWindow, ipcMain } from "electron";
import koffi from "koffi";
import type { Settings } from "@shared/contracts";
import { clickerButton, clickerInterval } from "@shared/clicker";
import { keyDown } from "./macroInput";
import { getSettings } from "./settings";
import { ownWindowFocused } from "./win32";

const nodeRequire = createRequire(import.meta.url);
const BUTTONS = { left: 1, right: 2, middle: 3 } as const;

function koffiFile(): string {
  const resolved = nodeRequire.resolve("koffi");
  const packed = `${path.sep}app.asar${path.sep}`;
  if (!resolved.includes(packed) || resolved.includes(`${path.sep}app.asar.unpacked${path.sep}`)) {
    return resolved;
  }
  return resolved.replace(packed, `${path.sep}app.asar.unpacked${path.sep}`);
}

const user32 = koffi.load("user32.dll");
const sendInput = user32.func(
  "uint32 __stdcall SendInput(uint32 count, _In_ uint8* inputs, int size)",
);
const MOUSE = {
  left: { down: 0x0002, up: 0x0004 },
  right: { down: 0x0008, up: 0x0010 },
  middle: { down: 0x0020, up: 0x0040 },
} as const;
const releaseInput = Buffer.alloc(40);

function releaseButton(button: keyof typeof MOUSE): void {
  releaseInput.fill(0);
  releaseInput.writeUInt32LE(MOUSE[button].up, 20);
  try { sendInput(1, releaseInput, 40); }
  catch (error) { console.error("autoclicker release", error); }
}

function releaseAll(): void {
  releaseButton("left");
  releaseButton("right");
  releaseButton("middle");
}

const workerSource = `
const { parentPort, workerData } = require("worker_threads");
const koffi = require(workerData.koffiPath);
const view = new Int32Array(workerData.state);
const user32 = koffi.load("user32.dll");
const winmm = koffi.load("winmm.dll");
const sendInput = user32.func(
  "uint32 __stdcall SendInput(uint32 count, _In_ uint8* inputs, int size)",
);
const beginPeriod = winmm.func("uint32 __stdcall timeBeginPeriod(uint32 period)");
const endPeriod = winmm.func("uint32 __stdcall timeEndPeriod(uint32 period)");
const FLAGS = {
  1: { down: 0x0002, up: 0x0004 },
  2: { down: 0x0008, up: 0x0010 },
  3: { down: 0x0020, up: 0x0040 },
};
const input = Buffer.alloc(40);
let clock = false;

function setClock(on) {
  if (on === clock) return;
  clock = on;
  if (on) beginPeriod(1);
  else endPeriod(1);
}

function click(button, up) {
  const mapped = FLAGS[button] || FLAGS[1];
  input.fill(0);
  input.writeUInt32LE(up ? mapped.up : mapped.down, 20);
  try { sendInput(1, input, 40); }
  catch (error) { parentPort.postMessage({ type: "error" }); }
}

while (true) {
  if (Atomics.load(view, 0) !== 1) {
    setClock(false);
    Atomics.wait(view, 0, 0, 250);
    continue;
  }
  const interval = Math.max(20, Atomics.load(view, 1));
  const button = Atomics.load(view, 2);
  const paused = Atomics.load(view, 3) === 1;
  if (paused) {
    setClock(false);
    Atomics.wait(view, 5, 0, interval);
    continue;
  }
  setClock(true);
  click(button, false);
  Atomics.wait(view, 5, 0, 12);
  click(button, true);
  Atomics.wait(view, 5, 0, Math.max(1, interval - 12));
}
`;

let worker: Worker | null = null;
let state: Int32Array | null = null;
let file = "";
let poll: NodeJS.Timeout | null = null;
let hotWas = false;
let running = false;
let holding = false;
let setup: BrowserWindow | null = null;
let restarts = 0;

function ensureFile(): string {
  if (file) return file;
  file = path.join(os.tmpdir(), "lumen-clicker.cjs");
  writeFileSync(file, workerSource, "utf8");
  return file;
}

function publish(): void {
  const payload = { running, holding };
  for (const current of BrowserWindow.getAllWindows()) {
    if (!current.isDestroyed()) current.webContents.send("clicker:state", payload);
  }
}

function syncSlots(settings: Settings): void {
  const view = state;
  if (!view) return;
  Atomics.store(view, 1, clickerInterval(settings.clickerIntervalMs));
  Atomics.store(view, 2, BUTTONS[clickerButton(settings.clickerButton)]);
  Atomics.store(view, 3, ownWindowFocused() ? 1 : 0);
}

function startWorker(): void {
  if (worker) return;
  const shared = new SharedArrayBuffer(24);
  state = new Int32Array(shared);
  const settings = getSettings();
  Atomics.store(state, 1, clickerInterval(settings.clickerIntervalMs));
  Atomics.store(state, 2, BUTTONS[clickerButton(settings.clickerButton)]);
  const next = new Worker(ensureFile(), {
    workerData: { koffiPath: koffiFile(), state: shared },
  });
  worker = next;
  next.on("exit", (code) => {
    if (worker !== next) return;
    worker = null;
    state = null;
    if (code !== 0 && running && restarts < 2) {
      restarts += 1;
      startWorker();
      arm(true);
    }
  });
}

function arm(next: boolean): void {
  const was = running;
  running = next;
  if (!next) {
    if (state) {
      Atomics.store(state, 0, 0);
      Atomics.notify(state, 0);
    }
    if (was) releaseAll();
    holding = false;
    publish();
    return;
  }
  startWorker();
  const view = state;
  if (!view) return;
  syncSlots(getSettings());
  Atomics.store(view, 0, 1);
  Atomics.notify(view, 0);
  holding = !ownWindowFocused();
  publish();
}

function watch(): void {
  const settings = getSettings();
  if (!settings.clickerEnabled) return;
  const focused = ownWindowFocused();
  if (state) Atomics.store(state, 3, focused ? 1 : 0);
  const nowHolding = running && !focused;
  if (nowHolding !== holding) {
    holding = nowHolding;
    publish();
  }
  const vk = settings.clickerToggleVk;
  if (vk <= 0) {
    hotWas = false;
    return;
  }
  const down = keyDown(vk);
  const pressed = down && !hotWas;
  hotWas = down;
  if (!pressed || focused) return;
  arm(!running);
}

export function applyClicker(settings: Settings): void {
  if (!settings.clickerEnabled) {
    if (poll) clearInterval(poll);
    poll = null;
    if (running) arm(false);
    restarts = 0;
    return;
  }
  syncSlots(settings);
  if (!poll) poll = setInterval(watch, 16);
}

export function toggleClicker(): { running: boolean; holding: boolean } {
  if (!getSettings().clickerEnabled) return { running: false, holding: false };
  arm(!running);
  return { running, holding };
}

export function clickerState(): { running: boolean; holding: boolean } {
  return { running, holding };
}

function loadSetup(target: BrowserWindow): void {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) void target.loadURL(`${dev}#/clicker`);
  else {
    void target.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "/clicker" });
  }
}

/** Opens the autoclicker window. A second call brings the same one forward. */
export function openClickerSettings(): void {
  if (setup && !setup.isDestroyed()) {
    if (setup.isMinimized()) setup.restore();
    setup.show();
    setup.focus();
    return;
  }
  const created = new BrowserWindow({
    width: 560,
    height: 520,
    minWidth: 480,
    minHeight: 460,
    frame: false,
    show: false,
    title: "Autoclicker",
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

export function clickerWindow(action: "minimize" | "maximize" | "close"): void {
  if (!setup || setup.isDestroyed()) return;
  if (action === "minimize") setup.minimize();
  else if (action === "maximize") {
    if (setup.isMaximized()) setup.unmaximize();
    else setup.maximize();
  } else setup.close();
}

export function initClicker(): void {
  ipcMain.handle("clicker:open", () => openClickerSettings());
  ipcMain.handle("clicker:window", (_event, action: unknown) => {
    const next = action === "minimize" || action === "maximize" ? action : "close";
    clickerWindow(next);
  });
  ipcMain.handle("clicker:toggle", () => toggleClicker());
  ipcMain.handle("clicker:state", () => clickerState());
  applyClicker(getSettings());
}

export function stopClicker(): void {
  if (poll) clearInterval(poll);
  poll = null;
  arm(false);
  const current = worker;
  worker = null;
  state = null;
  current?.terminate();
}
