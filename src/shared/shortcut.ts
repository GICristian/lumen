const MODIFIERS = ["Ctrl", "Alt", "Shift"] as const;
const KEY = /^(?:[A-Z0-9]|Space|F(?:[1-9]|1\d|2[0-4])|Up|Down|Left|Right|Home|End|PageUp|PageDown|Delete|Insert|Backspace|Enter|Return)$/;

export const DEFAULT_OVERLAY_SHORTCUT = "Ctrl+Alt+L";
export const DEFAULT_VAULT_SHORTCUT = "Ctrl+Alt+Shift+V";
export const DEFAULT_REPLAY_SHORTCUT = "Ctrl+Alt+Shift+R";
export const DEFAULT_SCREENSHOT_SHORTCUT = "Ctrl+Shift+S";
export const DEFAULT_SOUNDBOARD_SHORTCUT = "F8";

const FROM_EVENT: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

/**
 * One key, or that key with any mix of Ctrl, Alt, and Shift.
 * Windows global shortcuts are modifiers plus a single key, so two letters
 * cannot be a hotkey. The parts are stored as Ctrl, then Alt, then Shift.
 */
export function parseAccelerator(value: string): string | null {
  const parts = value.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 1 || parts.length > 4) return null;
  const mods: string[] = [];
  let key = "";
  for (const part of parts) {
    const mod = part === "Control" ? "Ctrl" : part;
    if ((MODIFIERS as readonly string[]).includes(mod)) {
      if (mods.includes(mod)) return null;
      mods.push(mod);
      continue;
    }
    if (key || !KEY.test(part)) return null;
    key = part;
  }
  if (!key) return null;
  const ordered = MODIFIERS.filter((mod) => mods.includes(mod));
  return [...ordered, key].join("+");
}

function readAccelerator(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return parseAccelerator(value) ?? fallback;
}

export function overlayAccelerator(value: unknown): string {
  return readAccelerator(value, DEFAULT_OVERLAY_SHORTCUT);
}

export function vaultAccelerator(value: unknown): string {
  return readAccelerator(value, DEFAULT_VAULT_SHORTCUT);
}

export function replayAccelerator(value: unknown): string {
  return readAccelerator(value, DEFAULT_REPLAY_SHORTCUT);
}

export function screenshotAccelerator(value: unknown): string {
  return readAccelerator(value, DEFAULT_SCREENSHOT_SHORTCUT);
}

export function soundboardAccelerator(value: unknown): string {
  return readAccelerator(value, DEFAULT_SOUNDBOARD_SHORTCUT);
}

export function acceleratorFromEvent(event: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
}): string | null {
  if (event.metaKey || event.repeat) return null;
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;
  let token = FROM_EVENT[event.key] ?? event.key;
  if (token.length === 1) token = token.toUpperCase();
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(token);
  return parseAccelerator(parts.join("+"));
}
