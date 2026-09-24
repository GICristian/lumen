import { describe, expect, it } from "vitest";
import { byteRangePlan, mediaContentType } from "./byteRange";

describe("byteRangePlan", () => {
  it("keeps a full response when no range is requested", () => {
    expect(byteRangePlan(1000, null)).toEqual({ kind: "full" });
  });

  it("reads an open-ended range through the last byte", () => {
    expect(byteRangePlan(1000, "bytes=400-")).toEqual({
      kind: "partial",
      start: 400,
      end: 999,
    });
  });

  it("clamps a closed range to the file size", () => {
    expect(byteRangePlan(1000, "bytes=0-50")).toEqual({
      kind: "partial",
      start: 0,
      end: 50,
    });
    expect(byteRangePlan(1000, "bytes=900-5000")).toEqual({
      kind: "partial",
      start: 900,
      end: 999,
    });
  });

  it("rejects a start past the end of the file", () => {
    expect(byteRangePlan(1000, "bytes=1000-")).toEqual({ kind: "unsatisfiable" });
  });
});

describe("mediaContentType", () => {
  it("maps video and thumbnail extensions", () => {
    expect(mediaContentType("C:\\clips\\film.mp4")).toBe("video/mp4");
    expect(mediaContentType("thumb.JPG")).toBe("image/jpeg");
  });
});
