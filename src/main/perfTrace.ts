import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import koffi from "koffi";

const nodeRequire = createRequire(import.meta.url);
const SESSION = "LumenPerf";

function koffiFile(): string {
  const resolved = nodeRequire.resolve("koffi");
  const packed = `${path.sep}app.asar${path.sep}`;
  if (!resolved.includes(packed) || resolved.includes(`${path.sep}app.asar.unpacked${path.sep}`)) {
    return resolved;
  }
  return resolved.replace(packed, `${path.sep}app.asar.unpacked${path.sep}`);
}

function traceProperties(): Buffer {
  const chars = SESSION.length + 1;
  const bytes = 120 + chars * 2;
  const props = Buffer.alloc(bytes);
  props.writeUInt32LE(bytes, 0);
  props.writeUInt32LE(1, 40);
  props.writeUInt32LE(0x00020000, 44);
  props.writeUInt32LE(64, 48);
  props.writeUInt32LE(16, 52);
  props.writeUInt32LE(64, 56);
  props.writeUInt32LE(0x100, 64);
  props.writeUInt32LE(120, 116);
  props.write(SESSION, 120, "utf16le");
  return props;
}

let controlTrace: ((handle: bigint, name: string, props: Buffer, code: number) => number) | null =
  null;

function traceControl(): (handle: bigint, name: string, props: Buffer, code: number) => number {
  if (controlTrace) return controlTrace;
  const adv = koffi.load("advapi32.dll");
  controlTrace = adv.func(
    "uint32 __stdcall ControlTraceW(uint64 handle, str16 name, void *props, uint32 code)",
  ) as (handle: bigint, name: string, props: Buffer, code: number) => number;
  return controlTrace;
}

export function flushPerfTrace(): void {
  try {
    traceControl()(0n, SESSION, traceProperties(), 3);
  } catch (error) {
    console.error("performance trace flush", error);
  }
}

export function stopPerfTrace(): void {
  try {
    traceControl()(0n, SESSION, traceProperties(), 1);
  } catch (error) {
    console.error("performance trace stop", error);
  }
}

const workerSource = `
const { parentPort, workerData } = require("worker_threads");
const koffi = require(workerData.koffiPath);
const view = new Uint32Array(workerData.counts);
const adv = koffi.load("advapi32.dll");
const startTrace = adv.func(
  "uint32 __stdcall StartTraceW(_Out_ uint64 *handle, str16 name, void *props)",
);
const controlTrace = adv.func(
  "uint32 __stdcall ControlTraceW(uint64 handle, str16 name, void *props, uint32 code)",
);
const enableTrace = adv.func(
  "uint32 __stdcall EnableTraceEx2(uint64 handle, void *guid, uint32 code, uint8 level," +
  " uint64 any, uint64 all, uint32 timeout, void *params)",
);
const openTrace = adv.func("uint64 __stdcall OpenTraceW(void *logfile)");
const processTrace = adv.func(
  "uint32 __stdcall ProcessTrace(uint64 *handles, uint32 count, void *start, void *end)",
);
const closeTrace = adv.func("uint32 __stdcall CloseTrace(uint64 handle)");
const session = ${JSON.stringify(SESSION)};
const DXGI = 0xCA11C036;
const DXGK = 0x802EC45A;

function guid(bytes) {
  const buffer = Buffer.alloc(16);
  bytes.forEach((value, index) => buffer.writeUInt8(value, index));
  return buffer;
}

function properties() {
  const chars = session.length + 1;
  const bytes = 120 + chars * 2;
  const props = Buffer.alloc(bytes);
  props.writeUInt32LE(bytes, 0);
  props.writeUInt32LE(1, 40);
  props.writeUInt32LE(0x00020000, 44);
  props.writeUInt32LE(64, 48);
  props.writeUInt32LE(16, 52);
  props.writeUInt32LE(64, 56);
  props.writeUInt32LE(0x100, 64);
  props.writeUInt32LE(120, 116);
  props.write(session, 120, "utf16le");
  return props;
}

const header = koffi.struct("LumenPerfEvent", {
  size: "uint16",
  headerType: "uint16",
  flags: "uint16",
  eventProperty: "uint16",
  threadId: "uint32",
  processId: "uint32",
  timeStamp: "int64",
  provider0: "uint32",
  provider1: "uint16",
  provider2: "uint16",
  provider3: "uint32",
  provider4: "uint32",
  id: "uint16",
  version: "uint8",
  channel: "uint8",
  level: "uint8",
  opcode: "uint8",
  task: "uint16",
});

let watched = 0;
let dxgiFor = 0;
function onRecord(record) {
  let info;
  try { info = koffi.decode(record, header); }
  catch (error) { return; }
  const target = Atomics.load(view, 0);
  if (target === 0) return;
  if (target !== watched) {
    watched = target;
    dxgiFor = 0;
  }
  const pid = info.processId >>> 0;
  if (pid !== target) return;
  const provider = info.provider0 >>> 0;
  if (provider === DXGI && info.id === 42) {
    dxgiFor = pid;
    Atomics.add(view, 1, 1);
    return;
  }
  if (provider === DXGK && info.task === 14 && info.opcode === 1 && dxgiFor !== pid) {
    Atomics.add(view, 1, 1);
  }
}

const proto = koffi.proto("void __stdcall LumenPerfRecord(void *record)");
const callback = koffi.register(onRecord, koffi.pointer(proto));
controlTrace(0n, session, properties(), 1);
const handle = [0n];
let started = startTrace(handle, session, properties());
if (started === 183) {
  controlTrace(0n, session, properties(), 1);
  started = startTrace(handle, session, properties());
}
if (started !== 0) {
  parentPort.postMessage({ type: "error", message: "start " + started });
  process.exit(0);
}
const dxgi = guid([
  0x36, 0xc0, 0x11, 0xca, 0x02, 0x01, 0x2d, 0x4a,
  0xa6, 0xad, 0xf0, 0x3c, 0xfe, 0xd5, 0xd3, 0xc9,
]);
const dxgk = guid([
  0x5a, 0xc4, 0x2e, 0x80, 0x99, 0x1e, 0x83, 0x4b,
  0x99, 0x20, 0x87, 0xc9, 0x82, 0x77, 0xba, 0x9d,
]);
enableTrace(handle[0], dxgi, 1, 4, 0n, 0n, 0, null);
enableTrace(handle[0], dxgk, 1, 4, 0x0000040000000000n, 0n, 0, null);
const name = Buffer.from(session + String.fromCharCode(0), "utf16le");
const logfile = Buffer.alloc(448);
logfile.writeBigUInt64LE(BigInt(koffi.address(name)), 8);
logfile.writeUInt32LE(0x100 | 0x10000000 | 0x1000, 28);
logfile.writeBigUInt64LE(BigInt(koffi.address(callback)), 424);
const trace = BigInt(openTrace(logfile));
if (trace === 0n || trace === 0xffffffffffffffffn) {
  controlTrace(handle[0], session, properties(), 1);
  parentPort.postMessage({ type: "error", message: "open" });
  process.exit(0);
}
parentPort.postMessage({ type: "open" });
const handles = Buffer.alloc(8);
handles.writeBigUInt64LE(trace);
processTrace(handles, 1, null, null);
closeTrace(trace);
controlTrace(handle[0], session, properties(), 1);
process.exit(0);
`;

let worker: Worker | null = null;
let counts: Uint32Array | null = null;
let wanted = false;
let restarts = 0;

export function perfFrameCount(): number {
  return counts ? Atomics.load(counts, 1) : 0;
}

export function setPerfTarget(pid: number): void {
  if (!counts) return;
  Atomics.store(counts, 0, pid >>> 0);
}

export function startPerfTrace(): void {
  wanted = true;
  if (worker) return;
  const shared = new SharedArrayBuffer(8);
  counts = new Uint32Array(shared);
  const file = path.join(os.tmpdir(), "lumen-perf-trace.cjs");
  writeFileSync(file, workerSource);
  const next = new Worker(file, { workerData: { koffiPath: koffiFile(), counts: shared } });
  worker = next;
  next.on("message", (message: { type?: string; message?: string }) => {
    if (message?.type === "error") console.error("performance trace", message.message);
  });
  next.on("error", (error) => {
    console.error("performance trace", error);
  });
  next.on("exit", () => {
    if (worker !== next) return;
    worker = null;
    counts = null;
    if (!wanted || restarts >= 2) return;
    restarts += 1;
    startPerfTrace();
  });
}

export function endPerfTrace(): void {
  wanted = false;
  restarts = 0;
  const current = worker;
  worker = null;
  counts = null;
  stopPerfTrace();
  void current?.terminate();
}
