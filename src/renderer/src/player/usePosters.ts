import { useCallback, useEffect, useRef, useState } from "react";
import type { FolderItem } from "@shared/contracts";
import { mediaUrl } from "./usePlayback";

const POSTER_FAIL = "fail";
const WORKERS = 2;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function usePosters(items: FolderItem[]): {
  posters: Record<string, string>;
  request: (path: string) => void;
} {
  const [posters, setPosters] = useState<Record<string, string>>({});
  const postersRef = useRef(posters);
  const wanted = useRef(new Set<string>());
  postersRef.current = posters;

  const request = useCallback((path: string) => {
    wanted.current.add(path);
  }, []);

  useEffect(() => {
    let stop = false;
    const known = new Set(items.map((item) => item.path));
    const busy = new Set<string>();

    const publish = (path: string, value: string): void => {
      postersRef.current = { ...postersRef.current, [path]: value };
      setPosters(postersRef.current);
    };

    const worker = async (): Promise<void> => {
      while (!stop) {
        const path = [...wanted.current].find((item) => {
          const pending = postersRef.current[item] === undefined && !busy.has(item);
          return known.has(item) && pending;
        });
        if (!path) {
          await wait(200);
          continue;
        }
        busy.add(path);
        let image: string | null = null;
        try {
          image = await window.lumen.thumbnail(path, null);
        } catch {
          image = null;
        }
        busy.delete(path);
        if (stop) return;
        publish(path, image ?? POSTER_FAIL);
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
