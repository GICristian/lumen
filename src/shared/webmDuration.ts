/** Read the small WebM Info header, never scan/decode video frames or spawn a process. */
export function webmDuration(bytes: Uint8Array): number | null {
  const limit = Math.min(bytes.length, 65536);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  function element(at: number): { id: number; start: number; end: number } | null {
    if (at >= limit || bytes[at] === 0) return null;
    let idSize = 1;
    while (idSize <= 4 && !(bytes[at] & (0x80 >> (idSize - 1)))) idSize++;
    if (idSize > 4 || at + idSize >= limit) return null;
    let id = 0; for (let i = 0; i < idSize; i++) id = id * 256 + bytes[at++];
    let sizeWidth = 1;
    while (sizeWidth <= 8 && !(bytes[at] & (0x80 >> (sizeWidth - 1)))) sizeWidth++;
    if (sizeWidth > 8 || at + sizeWidth > limit) return null;
    let size = bytes[at++] & ((1 << (8 - sizeWidth)) - 1);
    for (let i = 1; i < sizeWidth; i++) size = size * 256 + bytes[at++];
    return { id, start: at, end: Math.min(limit, at + size) };
  }
  let at = 0;
  while (at < limit) {
    const item = element(at); if (!item) return null;
    if (item.id === 0x18538067) { at = item.start; continue; } // Segment (often unknown length)
    if (item.id === 0x1549a966) {
      let duration = 0, scale = 1_000_000, pos = item.start;
      while (pos < item.end) {
        const field = element(pos); if (!field || field.end <= pos) break;
        const length = field.end - field.start;
        if (field.id === 0x4489) {
          if (length === 8) duration = view.getFloat64(field.start);
          else if (length === 4) duration = view.getFloat32(field.start);
        }
        if (field.id === 0x2ad7b1 && length <= 8) {
          scale = 0; for (let i = field.start; i < field.end; i++) scale = scale * 256 + bytes[i];
        }
        pos = field.end;
      }
      const seconds = duration * scale / 1_000_000_000;
      return Number.isFinite(seconds) && seconds > 0 && seconds <= 60 ? seconds : null;
    }
    if (item.end <= at) return null;
    at = item.end;
  }
  return null;
}
