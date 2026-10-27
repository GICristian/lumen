import { splitWebmChunk } from "@shared/webmPieces";

type Job = { id: number; blob: Blob };

function exact(view: Uint8Array): ArrayBuffer {
  const owned = view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
    ? view
    : view.slice();
  return owned.buffer as ArrayBuffer;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Job>) => void) | null;
  postMessage: (message: unknown, transfer?: ArrayBuffer[]) => void;
};

scope.onmessage = (event: MessageEvent<Job>) => {
  const { id, blob } = event.data;
  void blob.arrayBuffer().then((buffer) => {
    const split = splitWebmChunk(new Uint8Array(buffer));
    if (!split) {
      scope.postMessage({ id, ok: false });
      return;
    }
    const cluster = exact(split.cluster);
    const init = split.init ? exact(split.init) : null;
    const transfer = init ? [cluster, init] : [cluster];
    scope.postMessage({ id, ok: true, cluster, init }, transfer);
  }).catch(() => {
    scope.postMessage({ id, ok: false });
  });
};
