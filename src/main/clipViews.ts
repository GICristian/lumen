import { promises as fs } from "node:fs";
import path from "node:path";
import { favoriteKey } from "@shared/favorites";

let file = "";
let seen = new Map<string, number>();

export async function initClipViews(userData: string): Promise<void> {
  file = path.join(userData, "clip-views.json");
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return;
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "number" && Number.isFinite(value)) seen.set(key, value);
    }
  } catch {
    seen = new Map();
  }
}

export function clipSeenAt(filePath: string): number | null {
  const value = seen.get(favoriteKey(filePath));
  return typeof value === "number" ? value : null;
}

export function clipViews(): Record<string, number> {
  return Object.fromEntries(seen);
}

export async function noteClipView(filePath: string): Promise<Record<string, number>> {
  if (!filePath) return clipViews();
  seen.set(favoriteKey(filePath), Date.now());
  if (file) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(Object.fromEntries(seen)));
  }
  return clipViews();
}
