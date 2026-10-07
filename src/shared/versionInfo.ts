/** Reads one string from a VERSIONINFO block returned by GetFileVersionInfo. */
export function versionValue(block: Buffer, key: string): string | null {
  const needle = Buffer.from(`${key}\u0000`, "utf16le");
  const keyAt = block.indexOf(needle);
  if (keyAt < 6) return null;
  const valueChars = block.readUInt16LE(keyAt - 4);
  if (valueChars < 2 || valueChars > 260) return null;
  const valueAt = (keyAt + needle.length + 3) & ~3;
  const end = valueAt + (valueChars - 1) * 2;
  if (end > block.length) return null;
  const text = block.toString("utf16le", valueAt, end).replace(/\u0000/g, "").trim();
  return text || null;
}
