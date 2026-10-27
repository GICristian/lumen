export type ClickerButton = "left" | "right" | "middle";

/** Gap between clicks, in milliseconds. Kept off a spin so it does not burn a core. */
export function clickerInterval(value: unknown): number {
  const raw = typeof value === "number" ? value : 50;
  if (!Number.isFinite(raw)) return 50;
  return Math.min(2000, Math.max(20, Math.round(raw)));
}

export function clickerButton(value: unknown): ClickerButton {
  if (value === "right" || value === "middle") return value;
  return "left";
}

export function clickerToggleVk(value: unknown): number {
  const raw = typeof value === "number" ? value : 117;
  if (!Number.isFinite(raw)) return 117;
  return Math.min(255, Math.max(0, Math.round(raw)));
}
