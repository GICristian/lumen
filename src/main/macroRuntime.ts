import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import koffi from "koffi";
import type { MacroBind } from "@shared/macros";
import { setMacroPlaying } from "./macroGate";
import {
  TABLE_BYTES,
  claimPlay,
  publishTable,
  readBind,
  readSteps,
} from "./macroTable";

const nodeRequire = createRequire(import.meta.url);

function koffiFile(): string {
  const resolved = nodeRequire.resolve("koffi");
  const packed = `${path.sep}app.asar${path.sep}`;
  if (!resolved.includes(packed) || resolved.includes(`${path.sep}app.asar.unpacked${path.sep}`)) {
    return resolved;
  }
  return resolved.replace(packed, `${path.sep}app.asar.unpacked${path.sep}`);
}
const user32 = koffi.load("user32.dll");
const postThread = user32.func(
  "bool __stdcall PostThreadMessageW(uint32 id, uint32 msg, uintptr_t wParam, intptr_t lParam)",
);

const WM_QUIT = 0x0012;

let tableSab: SharedArrayBuffer | null = null;
let playSab: SharedArrayBuffer | null = null;
let tableView: Int32Array | null = null;
let playView: Int32Array | null = null;
let hookWorker: Worker | null = null;
let playerWorker: Worker | null = null;
let hookThreadId = 0;
let stopping = false;
let hookFailures = 0;
let playerFailures = 0;

function buffers(): { table: Int32Array; play: Int32Array } {
  if (!tableSab || !playSab || !tableView || !playView) {
    tableSab = new SharedArrayBuffer(TABLE_BYTES);
    playSab = new SharedArrayBuffer(24);
    tableView = new Int32Array(tableSab);
    playView = new Int32Array(playSab);
  }
  return { table: tableView, play: playView };
}

/** The power-key counter the keyboard thread increments. */
export function macroPowerGeneration(): number {
  if (!playView) return 0;
  return Atomics.load(playView, 3);
}

/** The hook reads this instead of asking Windows which window is in front. */
export function setMacroOwnFocus(focused: boolean): void {
  if (!playView) return;
  Atomics.store(playView, 4, focused ? 1 : 0);
}

/** Asks the player thread to run one macro. The keyboard thread uses the same claim. */
export function requestMacroPlay(index: number): boolean {
  if (!playView || !playerWorker) return false;
  return claimPlay(playView, index);
}

function playerSource(): string {
  return `
const { parentPort, workerData } = require("worker_threads");
const koffi = require(workerData.koffiPath);
const readSteps = ${readSteps.toString()};
const table = new Int32Array(workerData.table);
const play = new Int32Array(workerData.play);
const user32 = koffi.load("user32.dll");
const kernel = koffi.load("kernel32.dll");
const winmm = koffi.load("winmm.dll");
const sendInput = user32.func(
  "uint32 __stdcall SendInput(uint32 count, _In_ uint8* inputs, int size)",
);
const mapVirtualKey = user32.func(
  "uint32 __stdcall MapVirtualKeyW(uint32 code, uint32 map)",
);
const currentThread = kernel.func("void* __stdcall GetCurrentThread()");
const getPriority = kernel.func("int __stdcall GetThreadPriority(void* thread)");
const setPriority = kernel.func(
  "bool __stdcall SetThreadPriority(void* thread, int priority)",
);
const qpc = kernel.func("bool __stdcall QueryPerformanceCounter(void* counter)");
const qpf = kernel.func("bool __stdcall QueryPerformanceFrequency(void* freq)");
const beginPeriod = winmm.func("uint32 __stdcall timeBeginPeriod(uint32 period)");
const endPeriod = winmm.func("uint32 __stdcall timeEndPeriod(uint32 period)");
const ticks = Buffer.alloc(8);
const freqBuf = Buffer.alloc(8);
qpf(freqBuf);
const frequency = freqBuf.readBigInt64LE(0);
const INPUT_SIZE = 40;
const KEY_SCAN = 0x0008;
const KEY_UP = 0x0002;
const KEY_EXTENDED = 0x0001;
const MICE = { 1: "left", 2: "right", 3: "middle", 4: "x1", 5: "x2" };
const MOUSE = {
  left: { down: 0x0002, up: 0x0004, data: 0 },
  right: { down: 0x0008, up: 0x0010, data: 0 },
  middle: { down: 0x0020, up: 0x0040, data: 0 },
  x1: { down: 0x0080, up: 0x0100, data: 1 },
  x2: { down: 0x0080, up: 0x0100, data: 2 },
};

function now() {
  qpc(ticks);
  return ticks.readBigInt64LE(0);
}

function sleepPrecise(milliseconds) {
  if (!(milliseconds > 0) || frequency <= 0n) return;
  const span = BigInt(Math.round(milliseconds * 1000)) * frequency / 1000000n;
  const target = now() + span;
  while (now() < target) {}
}

function send(buffer) {
  try { return Number(sendInput(1, buffer, INPUT_SIZE)) === 1; }
  catch (error) { return false; }
}

const keyInput = Buffer.alloc(INPUT_SIZE);
function sendKey(vk, scan, extended, up) {
  const code = scan > 0 ? scan : Number(mapVirtualKey(vk, 0)) || 0;
  if (code <= 0 && vk <= 0) return false;
  keyInput.fill(0);
  keyInput.writeUInt32LE(1, 0);
  keyInput.writeUInt16LE(vk & 0xffff, 8);
  keyInput.writeUInt16LE(code & 0xffff, 10);
  let flags = KEY_SCAN;
  if (up) flags |= KEY_UP;
  if (extended) flags |= KEY_EXTENDED;
  keyInput.writeUInt32LE(flags, 12);
  return send(keyInput);
}

function sendMouse(button, up) {
  const mapped = MOUSE[button];
  if (!mapped) return false;
  const buffer = Buffer.alloc(INPUT_SIZE);
  buffer.writeUInt32LE(0, 0);
  buffer.writeUInt32LE(mapped.data << 16, 16);
  buffer.writeUInt32LE(up ? mapped.up : mapped.down, 20);
  return send(buffer);
}

function release(step) {
  if (step.device === 2) sendMouse(MICE[step.extra], true);
  else sendKey(step.vk, step.scan, step.extended === 1, true);
}

function playSteps(steps) {
  const held = [];
  let finished = false;
  try {
    for (const step of steps) {
      if (step.kind === 3) {
        sleepPrecise(step.extra / 1000);
        continue;
      }
      const up = step.kind === 2;
      if (step.device === 2) sendMouse(MICE[step.extra], up);
      else sendKey(step.vk, step.scan, step.extended === 1, up);
      if (!up) held.push(step);
      else {
        const index = held.findIndex((item) => (
          step.device === 2 ? item.extra === step.extra : item.vk === step.vk
        ));
        if (index >= 0) held.splice(index, 1);
      }
    }
    finished = true;
  } finally {
    if (!finished) {
      for (let index = held.length - 1; index >= 0; index -= 1) release(held[index]);
    }
  }
}

function withClock(run) {
  const thread = currentThread();
  let previous = 0x7fffffff;
  let raised = false;
  let period = false;
  try {
    previous = Number(getPriority(thread));
    raised = previous !== 0x7fffffff && Boolean(setPriority(thread, 2));
  } catch (error) { raised = false; }
  try { period = Number(beginPeriod(1)) === 0; }
  catch (error) { period = false; }
  try { run(); }
  finally {
    if (period) {
      try { endPeriod(1); }
      catch (error) { parentPort.postMessage({ type: "error", message: String(error) }); }
    }
    if (raised) {
      try { setPriority(thread, previous); }
      catch (error) { parentPort.postMessage({ type: "error", message: String(error) }); }
    }
  }
}

while (true) {
  Atomics.wait(play, 0, 0, 1000);
  if (Atomics.compareExchange(play, 0, 1, 0) !== 1) continue;
  const index = Atomics.load(play, 1);
  while (Atomics.load(play, 5) !== 0) {}
  parentPort.postMessage({ type: "playing", value: true });
  try { withClock(() => playSteps(readSteps(table, index))); }
  catch (error) {
    parentPort.postMessage({ type: "error", message: String(error) });
  } finally {
    Atomics.store(play, 2, 0);
    parentPort.postMessage({ type: "playing", value: false });
  }
}
`;
}

function hookSource(): string {
  return `
const { parentPort, workerData } = require("worker_threads");
const koffi = require(workerData.koffiPath);
const readBind = ${readBind.toString()};
const claimPlay = ${claimPlay.toString()};
const table = new Int32Array(workerData.table);
const play = new Int32Array(workerData.play);
const user32 = koffi.load("user32.dll");
const kernel = koffi.load("kernel32.dll");
const keyInfo = koffi.struct("LumenMacroKey", {
  vkCode: "uint32",
  scanCode: "uint32",
  flags: "uint32",
  time: "uint32",
  extra: "uintptr_t",
});
const proto = koffi.proto(
  "intptr_t __stdcall LumenMacroProc(int nCode, uintptr_t wParam, intptr_t lParam)",
);
const setHook = user32.func(
  "void* __stdcall SetWindowsHookExW(int idHook, LumenMacroProc* proc," +
  " void* module, uint32 threadId)",
);
const unhook = user32.func("bool __stdcall UnhookWindowsHookEx(void* hook)");
const callNext = user32.func(
  "intptr_t __stdcall CallNextHookEx(void* hook, int nCode, uintptr_t wParam, intptr_t lParam)",
);
const peek = user32.func(
  "bool __stdcall PeekMessageW(void* msg, void* hwnd, uint32 min, uint32 max, uint32 remove)",
);
const getMessage = user32.func(
  "int __stdcall GetMessageW(void* msg, void* hwnd, uint32 min, uint32 max)",
);
const translate = user32.func("bool __stdcall TranslateMessage(void* msg)");
const dispatch = user32.func("intptr_t __stdcall DispatchMessageW(void* msg)");
const asyncKey = user32.func("int16 __stdcall GetAsyncKeyState(int key)");
const getTid = kernel.func("uint32 __stdcall GetCurrentThreadId()");
const currentThread = kernel.func("void* __stdcall GetCurrentThread()");
const setPriority = kernel.func(
  "bool __stdcall SetThreadPriority(void* thread, int priority)",
);
const keyWas = new Uint8Array(256);
const msg = Buffer.alloc(96);
let hook = null;

function passed(nCode, wParam, lParam) {
  try { return BigInt(callNext(hook, nCode, wParam, lParam)); }
  catch (error) { return 0n; }
}

function eaten(nCode, wParam, lParam) {
  passed(nCode, wParam, lParam);
  return 1n;
}

function blocked() {
  try {
    if ((Number(asyncKey(0x10)) & 0x8000) !== 0) return true;
    if ((Number(asyncKey(0x11)) & 0x8000) !== 0) return true;
    if ((Number(asyncKey(0x12)) & 0x8000) !== 0) return true;
  } catch (error) {
    return false;
  }
  return Atomics.load(play, 4) === 1;
}

function onKey(nCode, wParam, lParam) {
  if (nCode < 0 || Atomics.load(play, 2) === 1) return passed(nCode, wParam, lParam);
  Atomics.store(play, 5, 1);
  try { return handleKey(nCode, wParam, lParam); }
  finally { Atomics.store(play, 5, 0); }
}

function handleKey(nCode, wParam, lParam) {
  if (nCode < 0) return passed(nCode, wParam, lParam);
  let info;
  try { info = koffi.decode(lParam, keyInfo); }
  catch (error) { return passed(nCode, wParam, lParam); }
  const flags = info.flags >>> 0;
  if ((flags & 0x12) !== 0) return passed(nCode, wParam, lParam);
  const vk = info.vkCode >>> 0;
  if (vk <= 0 || vk >= 256) return passed(nCode, wParam, lParam);
  const up = (flags & 0x80) !== 0;
  const decision = readBind(table, vk);
  if (decision === -2) return passed(nCode, wParam, lParam);
  if (decision === -1) {
    if (up) keyWas[vk] = 0;
    else if (!keyWas[vk] && !blocked()) {
      keyWas[vk] = 1;
      Atomics.add(play, 3, 1);
    }
    return passed(nCode, wParam, lParam);
  }
  if (up) {
    const armed = keyWas[vk] && decision > 0;
    keyWas[vk] = 0;
    return armed ? eaten(nCode, wParam, lParam) : passed(nCode, wParam, lParam);
  }
  if (keyWas[vk]) {
    return decision > 0 ? eaten(nCode, wParam, lParam) : passed(nCode, wParam, lParam);
  }
  if (decision <= 0 || blocked()) return passed(nCode, wParam, lParam);
  keyWas[vk] = 1;
  claimPlay(play, decision - 1);
  return eaten(nCode, wParam, lParam);
}

try { setPriority(currentThread(), 1); }
catch (error) { parentPort.postMessage({ type: "error", message: String(error) }); }
peek(msg, null, 0, 0, 0);
const proc = koffi.register(onKey, koffi.pointer(proto));
hook = setHook(13, proc, null, 0);
if (!hook || hook === 0n) {
  parentPort.postMessage({ type: "error", message: "macro hook was not installed" });
} else {
  parentPort.postMessage({ type: "ready", threadId: Number(getTid()) });
  while (Number(getMessage(msg, null, 0, 0)) > 0) {
    translate(msg);
    dispatch(msg);
  }
  try { unhook(hook); }
  catch (error) { parentPort.postMessage({ type: "error", message: String(error) }); }
}
`;
}

function openWorker(name: string, source: string, workerData: object): Worker {
  const file = path.join(os.tmpdir(), name);
  writeFileSync(file, source, "utf8");
  return new Worker(file, { workerData });
}

function watchPlayer(worker: Worker): void {
  worker.on("message", (message: { type?: string; value?: boolean; message?: string }) => {
    if (message?.type === "playing") setMacroPlaying(message.value === true);
    else if (message?.type === "error") console.error("macro play", message.message);
  });
  worker.on("error", (error) => console.error("macro play", error));
  worker.on("exit", () => {
    if (playerWorker !== worker) return;
    playerWorker = null;
    setMacroPlaying(false);
    if (playView) Atomics.store(playView, 2, 0);
    playerFailures += 1;
    if (!stopping && playerFailures <= 2) startPlayer();
  });
}

function startPlayer(): void {
  if (playerWorker || !tableSab || !playSab) return;
  let worker: Worker;
  try {
    worker = openWorker("lumen-macro-player.cjs", playerSource(), {
      table: tableSab,
      play: playSab,
      koffiPath: koffiFile(),
    });
  } catch (error) {
    console.error("macro play", error);
    return;
  }
  playerWorker = worker;
  watchPlayer(worker);
}

function startHook(): void {
  if (hookWorker || !tableSab || !playSab) return;
  let worker: Worker;
  try {
    worker = openWorker("lumen-macro-hook.cjs", hookSource(), {
      table: tableSab,
      play: playSab,
      koffiPath: koffiFile(),
      pid: process.pid,
    });
  } catch (error) {
    console.error("macro hook", error);
    return;
  }
  hookWorker = worker;
  worker.on("message", (message: { type?: string; threadId?: number; message?: string }) => {
    if (message?.type === "ready") hookThreadId = message.threadId ?? 0;
    else if (message?.type === "error") console.error("macro hook", message.message);
  });
  worker.on("error", (error) => console.error("macro hook", error));
  worker.on("exit", () => {
    if (hookWorker !== worker) return;
    hookWorker = null;
    hookThreadId = 0;
    hookFailures += 1;
    if (!stopping && hookFailures <= 2) startHook();
  });
}

/** Refreshes the binds and keeps the hook thread and the player thread running. */
export function syncMacroRuntime(
  macros: MacroBind[],
  live: boolean,
  powerVk: number,
  playable: (macro: MacroBind, index: number) => boolean,
): void {
  if (process.platform !== "win32") return;
  stopping = false;
  const { table } = buffers();
  publishTable(table, macros, live, powerVk, playable);
  startPlayer();
  startHook();
}

/** Stops both threads. Keys pass through again. */
export function stopMacroRuntime(): void {
  stopping = true;
  hookFailures = 0;
  playerFailures = 0;
  const id = hookThreadId;
  hookThreadId = 0;
  if (id) {
    try { postThread(id, WM_QUIT, 0, 0); }
    catch (error) { console.error("macro hook", error); }
  }
  const hook = hookWorker;
  const player = playerWorker;
  hookWorker = null;
  playerWorker = null;
  void hook?.terminate();
  void player?.terminate();
  setMacroPlaying(false);
  if (playView) Atomics.store(playView, 2, 0);
}
