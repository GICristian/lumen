import { splitWebmChunk } from "@shared/webmPieces";

type Split = { init: Uint8Array | null; cluster: Uint8Array };

type Reply = {
  id: number;
  ok: boolean;
  cluster?: ArrayBuffer;
  init?: ArrayBuffer | null;
};

let worker: Worker | null = null;
let failed = false;
let nextId = 0;
const pending = new Map<number, (split: Split | null) => void>();

function fallback(blob: Blob): Promise<Split | null> {
  return blob.arrayBuffer().then((buffer) => splitWebmChunk(new Uint8Array(buffer)));
}

function engine(): Worker | null {
  if (failed) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./sliceWorker.ts", import.meta.url), { type: "module" });
  } catch {
    failed = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const done = pending.get(event.data.id);
    if (!done) return;
    pending.delete(event.data.id);
    const cluster = event.data.cluster;
    if (!event.data.ok || !cluster) {
      done(null);
      return;
    }
    done({
      cluster: new Uint8Array(cluster),
      init: event.data.init ? new Uint8Array(event.data.init) : null,
    });
  };
  worker.onerror = () => {
    failed = true;
    worker = null;
    for (const done of pending.values()) done(null);
    pending.clear();
  };
  return worker;
}

/** Parses a recorder blob away from the thread that is holding the desktop frames. */
export function splitBlob(blob: Blob): Promise<Split | null> {
  const current = engine();
  if (!current) return fallback(blob);
  const id = ++nextId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      failed = true;
      void fallback(blob).then(resolve);
    }, 2500);
    pending.set(id, (split) => {
      clearTimeout(timer);
      if (split) resolve(split);
      else void fallback(blob).then(resolve);
    });
    try {
      current.postMessage({ id, blob });
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      void fallback(blob).then(resolve);
    }
  });
}
