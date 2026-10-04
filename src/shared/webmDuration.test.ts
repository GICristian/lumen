import { describe, expect, it } from "vitest";
import { webmDuration } from "./webmDuration";

describe("WebM duration metadata", () => {
  it("reads the actual encoded duration from an unknown-length Segment", () => {
    const duration = new Uint8Array(8); new DataView(duration.buffer).setFloat64(0, 3980.125);
    const bytes = new Uint8Array([0x18,0x53,0x80,0x67,0xff, 0x15,0x49,0xa9,0x66,0x8b, 0x44,0x89,0x88,...duration]);
    expect(webmDuration(bytes)).toBe(3.980125);
  });
  it("safely rejects missing, malformed and oversized duration metadata", () => {
    expect(webmDuration(new Uint8Array())).toBeNull();
    expect(webmDuration(new Uint8Array(65536))).toBeNull();
    const duration = new Uint8Array(8); new DataView(duration.buffer).setFloat64(0, Infinity);
    expect(webmDuration(new Uint8Array([0x15,0x49,0xa9,0x66,0x8b,0x44,0x89,0x88,...duration]))).toBeNull();
  });
});
