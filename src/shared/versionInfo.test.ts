import { describe, expect, it } from "vitest";
import { versionValue } from "./versionInfo";

function versionBlock(key: string, value: string): Buffer {
  const keyBytes = Buffer.from(`${key}\u0000`, "utf16le");
  const valueBytes = Buffer.from(`${value}\u0000`, "utf16le");
  const valueAt = (6 + keyBytes.length + 3) & ~3;
  const block = Buffer.alloc(valueAt + valueBytes.length);
  block.writeUInt16LE(block.length, 0);
  block.writeUInt16LE(valueBytes.length / 2, 2);
  block.writeUInt16LE(1, 4);
  keyBytes.copy(block, 6);
  valueBytes.copy(block, valueAt);
  return block;
}

describe("versionValue", () => {
  it("reads the product name after the padded key", () => {
    const block = versionBlock("ProductName", "Apex Legends");
    expect(versionValue(block, "ProductName")).toBe("Apex Legends");
  });
});
