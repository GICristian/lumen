type Element = { id: number; origin: number; start: number; end: number; unknown: boolean };

function element(bytes: Uint8Array, at: number, limit: number): Element | null {
  if (at >= limit || bytes[at] === 0) return null;
  const origin = at;
  let idSize = 1;
  while (idSize <= 4 && !(bytes[at] & (0x80 >> (idSize - 1)))) idSize++;
  if (idSize > 4 || at + idSize >= limit) return null;
  let id = 0;
  for (let i = 0; i < idSize; i++) id = id * 256 + bytes[at++];
  let sizeWidth = 1;
  while (sizeWidth <= 8 && at < limit && !(bytes[at] & (0x80 >> (sizeWidth - 1)))) sizeWidth++;
  if (sizeWidth > 8 || at + sizeWidth > limit) return null;
  // Unknown length is every data bit set. Shifts are 32-bit, so an 8-byte
  // length (what MediaRecorder writes for a live Segment) cannot be compared
  // as a number. Read the marker bytes instead.
  const dataBits = 8 - sizeWidth;
  const dataMask = dataBits === 0 ? 0 : (1 << dataBits) - 1;
  let unknown = (bytes[at] & dataMask) === dataMask;
  let size = bytes[at] & dataMask;
  at++;
  for (let i = 1; i < sizeWidth; i++) {
    const byte = bytes[at++];
    if (byte !== 0xFF) unknown = false;
    size = size * 256 + byte;
  }
  if (unknown) return { id, origin, start: at, end: limit, unknown: true };
  const end = at + size;
  if (end < at || end > limit) return null;
  return { id, origin, start: at, end, unknown: false };
}

/** Byte offset of the first Cluster, so a live header can be split from its media. */
export function findClusterOffset(bytes: Uint8Array): number | null {
  let at = 0;
  while (at < bytes.length) {
    const item = element(bytes, at, bytes.length);
    if (!item) return null;
    if (item.id === 0x1F43B675) return item.origin;
    if (item.id === 0x18538067) {
      at = item.start;
      continue;
    }
    if (item.unknown || item.end <= at) return null;
    at = item.end;
  }
  return null;
}

function isMediaBlock(id: number): boolean {
  return id === 0xA3 || id === 0xA1 || id === 0xA0;
}

function encodeSize(size: number): Uint8Array {
  if (size < 0x7F) return new Uint8Array([0x80 | size]);
  if (size < 0x4000) return new Uint8Array([0x40 | (size >> 8), size & 0xFF]);
  if (size < 0x200000) {
    return new Uint8Array([0x20 | (size >> 16), (size >> 8) & 0xFF, size & 0xFF]);
  }
  return new Uint8Array([
    0x10 | ((size >> 24) & 0x0F), (size >> 16) & 0xFF, (size >> 8) & 0xFF, size & 0xFF,
  ]);
}

/** Puts a run of blocks under a cluster whose timecode is 0, so block times stay put. */
function wrapBlocks(blocks: Uint8Array): Uint8Array {
  const timecode = new Uint8Array([0xE7, 0x81, 0x00]);
  const payload = timecode.length + blocks.length;
  const size = encodeSize(payload);
  const out = new Uint8Array(4 + size.length + payload);
  out.set([0x1F, 0x43, 0xB6, 0x75]);
  out.set(size, 4);
  out.set(timecode, 4 + size.length);
  out.set(blocks, 4 + size.length + timecode.length);
  return out;
}

function joinParts(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/**
 * Later audio slices are SimpleBlocks with no Cluster. Video slices already
 * start with a header or a cluster and are left untouched.
 */
function withClusters(bytes: Uint8Array): Uint8Array {
  const first = element(bytes, 0, bytes.length);
  if (!first || !isMediaBlock(first.id)) return bytes;
  let at = 0;
  while (at < bytes.length) {
    const item = element(bytes, at, bytes.length);
    if (!item || !isMediaBlock(item.id) || item.end <= at) break;
    if (item.unknown) return wrapBlocks(bytes);
    at = item.end;
  }
  if (at === 0) return wrapBlocks(bytes);
  const parts = [wrapBlocks(bytes.subarray(0, at))];
  if (at < bytes.length) parts.push(bytes.subarray(at));
  return joinParts(parts);
}

/** Header bytes, if this chunk still has one, and the cluster bytes that follow. */
export function splitWebmChunk(bytes: Uint8Array): { init: Uint8Array | null; cluster: Uint8Array } | null {
  const normalized = withClusters(bytes);
  const offset = findClusterOffset(normalized);
  if (offset === null) return null;
  if (offset === 0) return { init: null, cluster: normalized };
  return { init: normalized.subarray(0, offset), cluster: normalized.subarray(offset) };
}

/** TimecodeScale from the Info header. MediaRecorder uses 1 ms. */
export function timecodeScaleNs(init: Uint8Array): number {
  let at = 0;
  while (at < init.length) {
    const item = element(init, at, init.length);
    if (!item) return 1_000_000;
    if (item.id === 0x18538067 || item.id === 0x1549A966) {
      if (item.id === 0x1549A966) {
        let pos = item.start;
        while (pos < item.end) {
          const field = element(init, pos, item.end);
          if (!field || field.end <= pos) break;
          if (field.id === 0x2AD7B1) {
            let scale = 0;
            for (let i = field.start; i < field.end; i++) scale = scale * 256 + init[i];
            return scale > 0 ? scale : 1_000_000;
          }
          pos = field.end;
        }
        return 1_000_000;
      }
      at = item.start;
      continue;
    }
    if (item.unknown || item.end <= at) return 1_000_000;
    at = item.end;
  }
  return 1_000_000;
}

/** Where this cluster sits on the recorder clock, in seconds. */
export function clusterStartSeconds(bytes: Uint8Array, scaleNs = 1_000_000): number {
  const offset = findClusterOffset(bytes);
  if (offset === null) return 0;
  const cluster = element(bytes, offset, bytes.length);
  if (!cluster) return 0;
  const cap = Math.min(cluster.end, cluster.start + 32);
  let pos = cluster.start;
  while (pos < cap) {
    const field = element(bytes, pos, cap);
    if (!field || field.end <= pos) break;
    if (field.id === 0xE7) {
      let value = 0;
      for (let i = field.start; i < field.end; i++) value = value * 256 + bytes[i];
      const seconds = value * scaleNs / 1_000_000_000;
      return Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
    }
    pos = field.end;
  }
  return 0;
}
