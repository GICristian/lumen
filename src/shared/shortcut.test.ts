import { describe, expect, it } from "vitest";
import { acceleratorFromEvent, overlayAccelerator, parseAccelerator } from "./shortcut";

describe("parseAccelerator", () => {
  it("accepts one key or up to three modifiers in any order", () => {
    expect(parseAccelerator("Ctrl+Alt+L")).toBe("Ctrl+Alt+L");
    expect(parseAccelerator("Alt+F12")).toBe("Alt+F12");
    expect(parseAccelerator("L")).toBe("L");
    expect(parseAccelerator("Shift+Ctrl+A")).toBe("Ctrl+Shift+A");
    expect(parseAccelerator("Ctrl+Alt+Shift+R")).toBe("Ctrl+Alt+Shift+R");
    expect(parseAccelerator("A+B")).toBeNull();
    expect(parseAccelerator("Ctrl+Ctrl+A")).toBeNull();
    expect(parseAccelerator("nope")).toBeNull();
  });
});

describe("overlayAccelerator", () => {
  it("falls back when the stored shortcut is unusable", () => {
    expect(overlayAccelerator(null)).toBe("Ctrl+Alt+L");
    expect(overlayAccelerator("nope")).toBe("Ctrl+Alt+L");
    expect(overlayAccelerator("F9")).toBe("F9");
  });
});

describe("acceleratorFromEvent", () => {
  it("builds a shortcut from one key or from modifiers", () => {
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
    ).toBe("L");
    expect(
      acceleratorFromEvent({
        key: "F9",
        ctrlKey: false,
        altKey: true,
        shiftKey: true,
        metaKey: false,
      }),
    ).toBe("Alt+Shift+F9");
  });
});
