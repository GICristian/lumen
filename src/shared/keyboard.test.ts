import { describe, expect, it } from "vitest";
import { keyAction } from "./keyboard";

const base = { ctrlKey: false, metaKey: false, altKey: false, target: null };

describe("keyAction", () => {
  it("seeks on arrows and steps clips when ctrl is held", () => {
    expect(keyAction({ ...base, key: "ArrowRight" })).toEqual({
      type: "seek",
      direction: 1,
      fine: true,
    });
    expect(keyAction({ ...base, key: "ArrowLeft", shiftKey: true })).toEqual({
      type: "seek",
      direction: -1,
      fine: false,
    });
    expect(keyAction({ ...base, key: "ArrowLeft", ctrlKey: true })).toEqual({
      type: "sibling",
      direction: -1,
    });
  });

  it("ignores typing in fields", () => {
    expect(keyAction({ ...base, key: "ArrowLeft", target: { tagName: "INPUT" } })).toBeNull();
    expect(
      keyAction({
        ...base,
        key: "ArrowRight",
        target: { tagName: "INPUT", inputType: "range" },
      }),
    ).toEqual({ type: "seek", direction: 1, fine: true });
  });

  it("zooms in and out without the ctrl key", () => {
    expect(keyAction({ ...base, key: "+" })).toEqual({ type: "zoom", direction: 1 });
    expect(keyAction({ ...base, key: "-" })).toEqual({ type: "zoom", direction: -1 });
    expect(keyAction({ ...base, key: "0" })).toEqual({ type: "zoom-reset" });
  });

  it("maps loop, marks, and escape", () => {
    expect(keyAction({ ...base, key: "l" })).toEqual({ type: "toggle-loop" });
    expect(keyAction({ ...base, key: "I" })).toEqual({ type: "mark", which: "a" });
    expect(keyAction({ ...base, key: "Escape" })).toEqual({ type: "escape" });
  });
});
