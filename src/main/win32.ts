import koffi from "koffi";
import { coversDisplay, type PixelDisplay } from "@shared/displayCover";

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");
const winmm = koffi.load("winmm.dll");
const timeBeginPeriod = winmm.func("uint32 __stdcall timeBeginPeriod(uint32 period)");
const timeEndPeriod = winmm.func("uint32 __stdcall timeEndPeriod(uint32 period)");
let captureClockHeld = false;

/**
 * A 30 fps capture timer on Windows slips to about 22 fps unless the
 * system timer is at 1 ms. Held for the whole time replay is armed.
 */
export function holdCaptureClock(): void {
  if (process.platform !== "win32" || captureClockHeld) return;
  try {
    if (timeBeginPeriod(1) === 0) captureClockHeld = true;
  } catch (error) {
    console.error("capture clock", error);
  }
}

export function releaseCaptureClock(): void {
  if (!captureClockHeld) return;
  captureClockHeld = false;
  try {
    timeEndPeriod(1);
  } catch (error) {
    console.error("capture clock", error);
  }
}

const rectType = koffi.struct("LumenRect", {
  left: "int32",
  top: "int32",
  right: "int32",
  bottom: "int32",
});

const pointType = koffi.struct("LumenPoint", {
  x: "int32",
  y: "int32",
});

const getForegroundWindow = user32.func("void* __stdcall GetForegroundWindow()");
const setForegroundWindow = user32.func("bool __stdcall SetForegroundWindow(void* hWnd)");
const showWindow = user32.func("bool __stdcall ShowWindow(void* hWnd, int nCmdShow)");
const isIconic = user32.func("bool __stdcall IsIconic(void* hWnd)");
const getWindowThreadProcessId = user32.func(
  "uint32 __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32* pid)",
);
const getClassName = user32.func(
  "int __stdcall GetClassNameW(void* hWnd, _Out_ uint16* buffer, int max)",
);
const getWindowRect = user32.func("bool __stdcall GetWindowRect(void* hWnd, _Out_ LumenRect* rect)");
const clipCursor = user32.func("bool __stdcall ClipCursor(_In_ LumenRect* rect)");
const getCursorPos = user32.func("bool __stdcall GetCursorPos(_Out_ LumenPoint* point)");
const setCursorPos = user32.func("bool __stdcall SetCursorPos(int x, int y)");
const showCursor = user32.func("int __stdcall ShowCursor(int show)");
const attachThreadInput = user32.func(
  "bool __stdcall AttachThreadInput(uint32 from, uint32 to, bool attach)",
);
const getCurrentThreadId = kernel32.func("uint32 __stdcall GetCurrentThreadId()");
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const openProcess = kernel32.func(
  "void* __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)",
);
const closeHandle = kernel32.func("int __stdcall CloseHandle(void* handle)");
const queryImageName = kernel32.func(
  "int __stdcall QueryFullProcessImageNameW(void* process, uint32 flags, _Out_ uint16* name, _Inout_ uint32* size)",
);
const isWindow = user32.func("bool __stdcall IsWindow(void* hWnd)");
const getWindowPlacement = user32.func(
  "bool __stdcall GetWindowPlacement(void* hWnd, _Inout_ void* place)",
);
const setWindowPlacement = user32.func(
  "bool __stdcall SetWindowPlacement(void* hWnd, _In_ void* place)",
);
const setWindowPos = user32.func(
  "bool __stdcall SetWindowPos(void* hWnd, void* insertAfter, int x, int y, int cx, int cy, uint32 flags)",
);
const lockSetForegroundWindow = user32.func("bool __stdcall LockSetForegroundWindow(uint32 lock)");
const rawDeviceType = koffi.struct("LumenRawDevice", {
  usagePage: "uint16",
  usage: "uint16",
  flags: "uint32",
  target: "void*",
});
const registerRawInput = user32.func(
  "bool __stdcall RegisterRawInputDevices(_In_ LumenRawDevice* devices, uint32 count, uint32 size)",
);
const hookInfoType = koffi.struct("LumenMouseHook", {
  x: "int32",
  y: "int32",
  mouseData: "uint32",
  flags: "uint32",
  time: "uint32",
  extra: "uintptr_t",
});
const hookProto = koffi.proto(
  "intptr_t __stdcall LumenMouseProc(int nCode, uintptr_t wParam, intptr_t lParam)",
);
const setWindowsHookEx = user32.func(
  "void* __stdcall SetWindowsHookExW(int idHook, LumenMouseProc* proc, void* module, uint32 threadId)",
);
const callNextHook = user32.func(
  "intptr_t __stdcall CallNextHookEx(void* hook, int nCode, uintptr_t wParam, intptr_t lParam)",
);
const unhookWindowsHookEx = user32.func("bool __stdcall UnhookWindowsHookEx(void* hook)");

const SW_RESTORE = 9;
const SW_SHOWNA = 8;
const SWP_NOACTIVATE = 0x0010;
const SWP_NOMOVE = 0x0002;
const SWP_NOSIZE = 0x0001;
const LSFW_LOCK = 1;
const LSFW_UNLOCK = 2;

type Rect = { left: number; top: number; right: number; bottom: number };
type Point = { x: number; y: number };

const WH_MOUSE_LL = 14;
const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;
const WM_RBUTTONDOWN = 0x0204;
const WM_RBUTTONUP = 0x0205;
const WM_MBUTTONDOWN = 0x0207;
const WM_MBUTTONUP = 0x0208;
const WM_MOUSEWHEEL = 0x020a;
const RIDEV_REMOVE = 0x00000001;
const RIDEV_NOLEGACY = 0x00000030;
const RIDEV_CAPTUREMOUSE = 0x00000200;
const LLMHF_INJECTED = 0x00000001;

type MouseButton = "left" | "right" | "middle";

export type CapturedMouse = {
  kind: "move" | "down" | "up" | "wheel";
  button: MouseButton;
  x: number;
  y: number;
  deltaY: number;
};

let returnTo: bigint | null = null;
let cursorHeld = false;
let mouseHook: bigint | null = null;
let mouseProc: bigint | null = null;
let mouseSink: ((event: CapturedMouse) => void) | null = null;
let mousePass: ((x: number, y: number) => boolean) | null = null;
let mouseQueue: CapturedMouse[] = [];
let mouseQueued = false;
let grab: { frozenX: number; frozenY: number; x: number; y: number } | null = null;
let osCursorHidden = false;

function hideOsCursor(): void {
  if (osCursorHidden) return;
  showCursor(0);
  osCursorHidden = true;
}

function showOsCursor(): void {
  if (!osCursorHidden) return;
  showCursor(1);
  osCursorHidden = false;
}

function asHwnd(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(value);
  if (Buffer.isBuffer(value) && value.length >= 8) return value.readBigUInt64LE(0);
  return 0n;
}

function className(hwnd: bigint): string {
  const buffer = new Uint16Array(64);
  const length = getClassName(hwnd, buffer, buffer.length) as number;
  return Buffer.from(buffer.buffer).toString("utf16le", 0, Math.max(0, length) * 2);
}

function isShell(hwnd: bigint): boolean {
  const name = className(hwnd);
  return name === "Progman" || name === "WorkerW" || name === "Shell_TrayWnd";
}

export function hwndOf(handle: Buffer): bigint {
  return asHwnd(handle);
}

export function noteForeground(except: bigint[]): void {
  const foreground = asHwnd(getForegroundWindow());
  if (foreground === 0n || except.includes(foreground) || isShell(foreground)) return;
  returnTo = foreground;
}

export function currentForeground(): bigint {
  return asHwnd(getForegroundWindow());
}

export function savedForeground(): bigint | null {
  return returnTo;
}

export function takeForeground(): bigint | null {
  const target = returnTo;
  returnTo = null;
  if (target === null || target === 0n) return null;
  return target;
}

export function isWindowIconic(hwnd: bigint): boolean {
  return hwnd !== 0n && Boolean(isWindow(hwnd)) && Boolean(isIconic(hwnd));
}

function focusByForce(hwnd: bigint): void {
  if (hwnd === 0n || !isWindow(hwnd)) return;
  const current = asHwnd(getForegroundWindow());
  const foreignThread = getWindowThreadProcessId(current, [0]) as number;
  const ours = getCurrentThreadId() as number;
  const attached = foreignThread !== 0 && foreignThread !== ours;
  if (attached) attachThreadInput(foreignThread, ours, true);
  setForegroundWindow(hwnd);
  if (attached) attachThreadInput(foreignThread, ours, false);
}

export function focusWindow(hwnd: bigint): void {
  if (isIconic(hwnd)) showWindow(hwnd, SW_RESTORE);
  focusByForce(hwnd);
}

export function showBehind(hwnd: bigint, front: bigint): void {
  if (hwnd === 0n || !isWindow(hwnd) || hwnd === front) return;
  const place = Buffer.alloc(44);
  place.writeUInt32LE(44, 0);
  if (getWindowPlacement(hwnd, place)) {
    place.writeUInt32LE(SW_SHOWNA, 8);
    setWindowPlacement(hwnd, place);
  } else {
    showWindow(hwnd, SW_SHOWNA);
  }
  const flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
  setWindowPos(hwnd, front, 0, 0, 0, 0, flags);
}

export function lockForeground(lock: boolean): void {
  lockSetForegroundWindow(lock ? LSFW_LOCK : LSFW_UNLOCK);
}

export function restoreForeground(): void {
  const target = takeForeground();
  if (target === null) return;
  focusWindow(target);
}

function processImage(pid: number): { name: string; imagePath: string } | null {
  if (pid <= 0) return null;
  let handle: unknown = null;
  try {
    handle = openProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if (!handle) return null;
    const buffer = new Uint16Array(520);
    const size = [buffer.length];
    if (!queryImageName(handle, 0, buffer, size)) return null;
    const chars = size[0];
    if (!Number.isFinite(chars) || chars <= 0) return null;
    const text = Buffer.from(buffer.buffer, buffer.byteOffset, chars * 2).toString("utf16le");
    const base = text.split(/[/\\]/).pop() ?? "";
    const stem = base.replace(/\.exe$/i, "").trim();
    if (!stem) return null;
    return { name: stem, imagePath: text };
  } catch (error) {
    console.error("process name", error);
    return null;
  } finally {
    if (handle) {
      try {
        closeHandle(handle);
      } catch (error) {
        console.error("process name", error);
      }
    }
  }
}

export type FocusedApp = {
  name: string | null;
  fullscreen: boolean;
  imagePath: string | null;
};

/**
 * The window in front, or the one the overlay was covering.
 * Fullscreen is true when that window fills a monitor.
 */
export function focusedApp(displays: PixelDisplay[]): FocusedApp {
  try {
    let hwnd = asHwnd(getForegroundWindow());
    if (hwnd !== 0n) {
      const owner = [0];
      getWindowThreadProcessId(hwnd, owner);
      if (owner[0] === process.pid) {
        const saved = savedForeground();
        if (saved) hwnd = saved;
      }
    }
    if (hwnd === 0n || isShell(hwnd)) return { name: null, fullscreen: false, imagePath: null };
    const pid = [0];
    getWindowThreadProcessId(hwnd, pid);
    if (pid[0] === process.pid) return { name: null, fullscreen: false, imagePath: null };
    const rect = windowRect(hwnd);
    const fullscreen = rect
      ? displays.some((display) => coversDisplay(rect, display))
      : false;
    const image = processImage(pid[0]);
    return {
      name: image?.name ?? null,
      fullscreen,
      imagePath: image?.imagePath ?? null,
    };
  } catch (error) {
    console.error("focused app", error);
    return { name: null, fullscreen: false, imagePath: null };
  }
}

/** True when another app is borderless or exclusive on one of these monitors. */
export function foregroundCovers(displays: PixelDisplay[]): boolean {
  try {
    const hwnd = asHwnd(getForegroundWindow());
    if (hwnd === 0n) return false;
    const pid = [0];
    getWindowThreadProcessId(hwnd, pid);
    if (pid[0] === process.pid) return false;
    const rect = windowRect(hwnd);
    if (!rect) return false;
    return displays.some((display) => coversDisplay(rect, display));
  } catch {
    return false;
  }
}

function windowRect(hwnd: bigint): Rect | null {
  const rect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!getWindowRect(hwnd, rect)) return null;
  if (rect.right <= rect.left || rect.bottom <= rect.top) return null;
  return rect;
}

function cursorPoint(): Point | null {
  const point: Point = { x: 0, y: 0 };
  if (!getCursorPos(point)) return null;
  return point;
}

function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom;
}

export function readCursor(): Point | null {
  return cursorPoint();
}

export function holdCursor(hwnd: bigint, before: Point | null): void {
  const rect = windowRect(hwnd);
  if (!rect) return;
  const after = cursorPoint();
  const jumped = before && after && contains(rect, before) && !contains(rect, after);
  if (jumped && before) setCursorPos(before.x, before.y);
  cursorHeld = true;
  clipCursor(rect);
}

export function moveCursorClip(hwnd: bigint): void {
  if (!cursorHeld) return;
  const rect = windowRect(hwnd);
  if (rect) clipCursor(rect);
}

export function releaseCursor(): void {
  cursorHeld = false;
  clipCursor(null);
}

export function placeCursor(x: number, y: number): Point | null {
  setCursorPos(Math.round(x), Math.round(y));
  return cursorPoint();
}

export function isInsideWindow(hwnd: bigint, x: number, y: number): boolean {
  const rect = windowRect(hwnd);
  if (!rect) return false;
  return x >= rect.left && y >= rect.top && x < rect.right && y < rect.bottom;
}

export function isResizeEdge(hwnd: bigint, x: number, y: number): boolean {
  const rect = windowRect(hwnd);
  if (!rect) return false;
  const margin = 8;
  const inside = x >= rect.left && y >= rect.top && x < rect.right && y < rect.bottom;
  if (!inside) return false;
  return (
    x - rect.left <= margin ||
    y - rect.top <= margin ||
    rect.right - x <= margin ||
    rect.bottom - y <= margin
  );
}

export function captureRawMouse(hwnd: bigint): boolean {
  const registered = registerRawInput(
    {
      usagePage: 0x01,
      usage: 0x02,
      flags: RIDEV_NOLEGACY | RIDEV_CAPTUREMOUSE,
      target: hwnd,
    },
    1,
    koffi.sizeof(rawDeviceType),
  );
  return Boolean(registered);
}

export function releaseRawMouse(): void {
  registerRawInput(
    { usagePage: 0x01, usage: 0x02, flags: RIDEV_REMOVE, target: null },
    1,
    koffi.sizeof(rawDeviceType),
  );
}

function wheelDelta(mouseData: number): number {
  let high = (mouseData >>> 16) & 0xffff;
  if (high & 0x8000) high -= 0x10000;
  return high / 120;
}

function captureMouse(message: number, x: number, y: number, mouseData: number): void {
  let event: CapturedMouse | null = null;
  if (message === WM_MOUSEMOVE) {
    event = { kind: "move", button: "left", x, y, deltaY: 0 };
  } else if (message === WM_LBUTTONDOWN) {
    event = { kind: "down", button: "left", x, y, deltaY: 0 };
  } else if (message === WM_LBUTTONUP) {
    event = { kind: "up", button: "left", x, y, deltaY: 0 };
  } else if (message === WM_RBUTTONDOWN) {
    event = { kind: "down", button: "right", x, y, deltaY: 0 };
  } else if (message === WM_RBUTTONUP) {
    event = { kind: "up", button: "right", x, y, deltaY: 0 };
  } else if (message === WM_MBUTTONDOWN) {
    event = { kind: "down", button: "middle", x, y, deltaY: 0 };
  } else if (message === WM_MBUTTONUP) {
    event = { kind: "up", button: "middle", x, y, deltaY: 0 };
  } else if (message === WM_MOUSEWHEEL) {
    event = { kind: "wheel", button: "left", x, y, deltaY: wheelDelta(mouseData) };
  }
  if (!event || !mouseSink) return;
  mouseQueue.push(event);
  if (mouseQueued) return;
  mouseQueued = true;
  setImmediate(() => {
    mouseQueued = false;
    const batch = mouseQueue;
    mouseQueue = [];
    const deliver = mouseSink;
    if (!deliver) return;
    for (const item of batch) deliver(item);
  });
}

function nextHook(nCode: number, wParam: bigint, lParam: bigint): bigint {
  return BigInt(callNextHook(null, nCode, wParam, lParam) as number | bigint);
}

function trackGrab(rawX: number, rawY: number): { x: number; y: number } | null {
  if (!grab) {
    const cursor = cursorPoint();
    if (!cursor) return null;
    grab = { frozenX: cursor.x, frozenY: cursor.y, x: rawX, y: rawY };
    hideOsCursor();
    return { x: grab.x, y: grab.y };
  }
  grab.x += rawX - grab.frozenX;
  grab.y += rawY - grab.frozenY;
  return { x: grab.x, y: grab.y };
}

function onMouseHook(nCode: number, wParam: bigint, lParam: bigint): bigint {
  if (nCode < 0 || !mouseSink) return nextHook(nCode, wParam, lParam);
  try {
    const info = koffi.decode(lParam, hookInfoType) as {
      x: number;
      y: number;
      mouseData: number;
      flags: number;
    };
    if ((info.flags & LLMHF_INJECTED) !== 0) return 1n;
    if (!grab && mousePass?.(info.x, info.y)) return nextHook(nCode, wParam, lParam);
    const point = trackGrab(info.x, info.y);
    if (!point) return 1n;
    if (mousePass?.(point.x, point.y)) {
      setCursorPos(Math.round(point.x), Math.round(point.y));
      grab = null;
      showOsCursor();
      return 1n;
    }
    captureMouse(Number(wParam), point.x, point.y, info.mouseData);
  } catch (error) {
    console.error("mouse hook", error);
  }
  return 1n;
}

export function setMouseSink(
  sink: ((event: CapturedMouse) => void) | null,
  pass?: (x: number, y: number) => boolean,
): void {
  mouseSink = sink;
  mousePass = sink ? (pass ?? null) : null;
  if (!sink) {
    if (mouseHook) unhookWindowsHookEx(mouseHook);
    mouseHook = null;
    mouseQueue = [];
    grab = null;
    showOsCursor();
    return;
  }
  if (mouseHook) return;
  if (!mouseProc) mouseProc = koffi.register(onMouseHook, koffi.pointer(hookProto));
  const handle = asHwnd(setWindowsHookEx(WH_MOUSE_LL, mouseProc, null, 0));
  if (handle === 0n) {
    console.error("overlay mouse hook was not installed");
    return;
  }
  mouseHook = handle;
}

void rectType;
void pointType;
void hookInfoType;
void hookProto;
void rawDeviceType;
