/**
 * Concat matches streams by their index, not their codec. Independent recordings
 * may list Tracks in a different order. Canonicalize the small Tracks header;
 * keep every TrackNumber and all encoded packets intact (no re-encoding).
 */
export function normalizeWebmTracks(bytes: Uint8Array): Uint8Array {
  const limit = Math.min(bytes.length, 65536);
  type Element = { at: number; id: number; start: number; end: number };
  function read(at: number): Element | null {
    const origin = at;
    if (at >= limit || !bytes[at]) return null;
    let width = 1;
    while (width <= 4 && !(bytes[at] & (0x80 >> (width - 1)))) width++;
    if (width > 4 || at + width >= limit) return null;
    let id = 0;
    for (let i = 0; i < width; i++) id = id * 256 + bytes[at++];
    width = 1;
    while (width <= 8 && !(bytes[at] & (0x80 >> (width - 1)))) width++;
    if (width > 8 || at + width > limit) return null;
    let size = bytes[at++] & ((1 << (8 - width)) - 1);
    for (let i = 1; i < width; i++) size = size * 256 + bytes[at++];
    return { at: origin, id, start: at, end: at + size };
  }
  let at = 0;
  while (at < limit) {
    const item = read(at);
    if (!item) return bytes;
    if (item.id === 0x18538067) { at = item.start; continue; }
    if (item.id === 0x1654ae6b) {
      if (item.end > limit) return bytes;
      const entries: (Element & { type: number })[] = [];
      let pos = item.start;
      while (pos < item.end) {
        const entry = read(pos);
        // Leave unusual headers (e.g. CRC elements) untouched rather than invalidate them.
        if (!entry || entry.id !== 0xae || entry.end > item.end || entry.end <= pos) return bytes;
        let type = 0, fieldAt = entry.start;
        while (fieldAt < entry.end) {
          const field = read(fieldAt);
          if (!field || field.end > entry.end || field.end <= fieldAt) return bytes;
          if (field.id === 0x83 && field.end - field.start === 1) type = bytes[field.start];
          fieldAt = field.end;
        }
        entries.push({ ...entry, type }); pos = entry.end;
      }
      if (entries.length !== 2 || !entries.some(e => e.type === 1) || !entries.some(e => e.type === 2)) return bytes;
      if (entries[0].type === 1) return bytes;
      const output = new Uint8Array(bytes);
      pos = item.start;
      for (const entry of [...entries].sort((a, b) => a.type - b.type)) {
        output.set(bytes.subarray(entry.at, entry.end), pos); pos += entry.end - entry.at;
      }
      return output;
    }
    if (item.end <= at || item.end > limit) return bytes;
    at = item.end;
  }
  return bytes;
}
