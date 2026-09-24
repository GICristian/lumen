const ACCELERATOR = /^(Ctrl\+|Alt\+|Shift\+)+([A-Z0-9]|Space|F(?:[1-9]|1[0-2]))$/;
export const DEFAULT_OVERLAY_SHORTCUT = "Ctrl+Alt+L";

export function parseAccelerator(value: string): string | null {
  return ACCELERATOR.test(value) ? value : null;
}

export function overlayAccelerator(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_OVERLAY_SHORTCUT;
  return parseAccelerator(value) ?? DEFAULT_OVERLAY_SHORTCUT;
}

export function acceleratorFromEvent(event: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  if (event.metaKey) return null;
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null;
  let token = event.key;
  if (token === " ") token = "Space";
  else if (token.length === 1) token = token.toUpperCase();
  parts.push(token);
  return parseAccelerator(parts.join("+"));
}
