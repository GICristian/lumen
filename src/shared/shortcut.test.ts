import { describe, expect, it } from "vitest";
import { acceleratorFromEvent, overlayAccelerator, parseAccelerator } from "./shortcut";

describe("parseAccelerator", () => {
  it("accepts a modifier plus a key", () => {
    expect(parseAccelerator("Ctrl+Alt+L")).toBe("Ctrl+Alt+L");
    expect(parseAccelerator("Alt+F12")).toBe("Alt+F12");
    expect(parseAccelerator("L")).toBeNull();
    expect(parseAccelerator("Ctrl+Alt+Z")).toBe("Ctrl+Alt+Z");
  });
});

describe("overlayAccelerator", () => {
  it("falls back when the stored shortcut is unusable", () => {
    expect(overlayAccelerator(null)).toBe("Ctrl+Alt+L");
    expect(overlayAccelerator("nope")).toBe("Ctrl+Alt+L");
  });
});

describe("acceleratorFromEvent", () => {
  it("builds a shortcut from modifiers and ignores a bare letter", () => {
    expect(
      acceleratorFromEvent({
        key: "l",
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBe("Ctrl+Alt+L");
    expect(
      acceleratorFromEvent({
        key: "l",
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBeNull();
  });
});
