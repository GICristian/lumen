import { useCallback, useEffect, useRef, useState } from "react";
import type { FolderItem } from "@shared/contracts";
import { mediaUrl } from "./usePlayback";

export const POSTER_FAIL = "fail";
const WORKERS = 3;
const ATTEMPTS = 2;

const remembered = new Map<string, string>();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function seedPosters(items: FolderItem[]): Record<string, string> {
  const seed: Record<string, string> = {};
  for (const item of items) {
    const saved = remembered.get(item.path);
    if (saved) seed[item.path] = saved;
  }
  return seed;
}

export function usePosters(items: FolderItem[]): {
  posters: Record<string, string>;
  request: (path: string) => void;
} {
  const [posters, setPosters] = useState<Record<string, string>>(() => seedPosters(items));
  const postersRef = useRef(posters);
  const wanted = useRef<string[]>([]);
  postersRef.current = posters;

  const request = useCallback((path: string) => {
    const list = wanted.current;
    const index = list.indexOf(path);
    if (index === 0) return;
    if (index > 0) list.splice(index, 1);
    list.unshift(path);
  }, []);

  useEffect(() => {
    let stop = false;
    const known = new Set(items.map((item) => item.path));
    for (const item of items) {
      if (!wanted.current.includes(item.path)) wanted.current.push(item.path);
    }
    const seeded = { ...postersRef.current, ...seedPosters(items) };
    postersRef.current = seeded;
    setPosters(seeded);

    const busy = new Set<string>();
    const tries = new Map<string, number>();

    const publish = (path: string, value: string): void => {
      const current = postersRef.current[path];
      if (value === POSTER_FAIL && current && current !== POSTER_FAIL) return;
      if (current === value) return;
      if (value !== POSTER_FAIL) remembered.set(path, value);
      postersRef.current = { ...postersRef.current, [path]: value };
      setPosters(postersRef.current);
    };

    const nextPath = (): string | undefined => {
      for (const item of wanted.current) {
        if (!known.has(item) || busy.has(item)) continue;
        const current = postersRef.current[item];
        const attempt = tries.get(item) ?? 0;
        if (current === undefined || (current === POSTER_FAIL && attempt < ATTEMPTS)) {
          return item;
        }
      }
      return undefined;
    };

    const worker = async (): Promise<void> => {
      while (!stop) {
        const path = nextPath();
        if (!path) {
          await wait(200);
          continue;
        }
        busy.add(path);
        tries.set(path, (tries.get(path) ?? 0) + 1);
        let image: string | null = null;
        try {
          image = await window.lumen.thumbnail(path, null);
        } catch {
          image = null;
        }
        busy.delete(path);
        if (stop) return;
        if (image) publish(path, image);
        else if ((tries.get(path) ?? 0) >= ATTEMPTS) publish(path, POSTER_FAIL);
      }
    };

    for (let slot = 0; slot < WORKERS; slot += 1) void worker();
    return () => {
      stop = true;
    };
  }, [items]);

  return { posters, request };
}

export function posterImage(value: string | undefined): string | null {
  if (!value || value === POSTER_FAIL) return null;
  return mediaUrl(value);
}
