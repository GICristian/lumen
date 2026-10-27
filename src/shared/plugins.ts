import { parseAccelerator } from "./shortcut";

export const MAX_WHEEL_SOUNDS = 12;
export const WHEEL_DEAD_ZONE = 46;
export const SOUND_EXTENSIONS = [".wav", ".mp3", ".ogg"] as const;
const CURSOR_STILL = 8;
const VIRTUAL_OUTPUT = /cable|voicemeeter|vb-audio|blackhole|wave link|elgato/i;
const NOT_A_CABLE = /hyperx|virtual surround|steam streaming/i;

export type SoundClip = {
  name: string;
  path: string;
};

export type SoundboardLibrary = {
  folder: string;
  sounds: SoundClip[];
};

export type KeyChord = {
  vk: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
};

const NAMED_KEYS: Record<string, number> = {
  Space: 0x20,
  Up: 0x26,
  Down: 0x28,
  Left: 0x25,
  Right: 0x27,
  Home: 0x24,
  End: 0x23,
  PageUp: 0x21,
  PageDown: 0x22,
  Delete: 0x2e,
  Insert: 0x2d,
  Backspace: 0x08,
  Enter: 0x0d,
  Return: 0x0d,
};

/** Virtual key for a stored accelerator, or null when it cannot be held. */
export function keyChord(accelerator: string): KeyChord | null {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return null;
  const parts = parsed.split("+");
  const key = parts[parts.length - 1] ?? "";
  let vk: number | null = null;
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(key)) vk = 0x70 + Number(key.slice(1)) - 1;
  else if (/^[A-Z0-9]$/.test(key)) vk = key.charCodeAt(0);
  else vk = NAMED_KEYS[key] ?? null;
  if (vk === null) return null;
  return {
    vk,
    ctrl: parts.includes("Ctrl"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
  };
}

/**
 * Slice under the pointer. Zero is up, then clockwise.
 * The center dead zone selects nothing.
 */
export function wheelIndex(
  dx: number,
  dy: number,
  count: number,
  dead = WHEEL_DEAD_ZONE,
): number | null {
  if (count <= 0) return null;
  if (dx * dx + dy * dy < dead * dead) return null;
  let turned = Math.atan2(dx, -dy);
  if (turned < 0) turned += Math.PI * 2;
  const slice = (Math.PI * 2) / count;
  return Math.floor(turned / slice) % count;
}

export type RawMouseMove = {
  dx: number;
  dy: number;
  absolute: boolean;
  leftDown: boolean;
  leftUp: boolean;
};

/**
 * Mouse delta inside a RAWINPUT packet.
 * On 64-bit Windows the header is 24 bytes and the coordinates sit 12 and 16 bytes after it.
 */
export function parseRawMouse(data: Uint8Array, headerBytes: number): RawMouseMove | null {
  if (headerBytes < 16 || data.byteLength < headerBytes + 20) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== 0) return null;
  const flags = view.getUint16(headerBytes, true);
  const buttons = view.getUint16(headerBytes + 4, true);
  return {
    dx: view.getInt32(headerBytes + 12, true),
    dy: view.getInt32(headerBytes + 16, true),
    absolute: (flags & 0x01) !== 0,
    leftDown: (buttons & 0x0001) !== 0,
    leftUp: (buttons & 0x0002) !== 0,
  };
}

/**
 * Uses the cursor when it moved. Uses raw counts when the cursor stays put.
 */
export function wheelAim(
  cursorDx: number,
  cursorDy: number,
  rawDx: number,
  rawDy: number,
  rawHeard: boolean,
): { dx: number; dy: number } {
  const still = cursorDx * cursorDx + cursorDy * cursorDy < CURSOR_STILL * CURSOR_STILL;
  if (rawHeard && still) return { dx: rawDx, dy: rawDy };
  return { dx: cursorDx, dy: cursorDy };
}

/** Playback devices that loop into a capture device Discord can select. */
export function virtualOutput(label: string): boolean {
  const name = label.trim();
  if (!name || NOT_A_CABLE.test(name)) return false;
  return VIRTUAL_OUTPUT.test(name);
}

const HEADSET = /hyperx|headset earphone/i;

/** The headset the player is wearing, never the virtual cable. */
export function headsetOutput(label: string): boolean {
  const name = label.trim();
  if (!name || virtualOutput(name)) return false;
  return HEADSET.test(name);
}

/** Capture name Discord should use for a virtual playback device. */
export function discordInputHint(outputLabel: string): string {
  return outputLabel.replace(/\bInput\b/g, "Output");
}
