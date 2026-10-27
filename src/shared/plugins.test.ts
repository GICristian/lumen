import { describe, expect, it } from "vitest";
import {
  discordInputHint,
  headsetOutput,
  keyChord,
  parseRawMouse,
  virtualOutput,
  wheelAim,
  wheelIndex,
} from "./plugins";

describe("wheelIndex", () => {
  it("keeps the center empty and walks clockwise from the top", () => {
    expect(wheelIndex(0, 0, 4)).toBeNull();
    expect(wheelIndex(10, -10, 4)).toBeNull();
    expect(wheelIndex(0, -80, 4)).toBe(0);
    expect(wheelIndex(80, 0, 4)).toBe(1);
    expect(wheelIndex(0, 80, 4)).toBe(2);
    expect(wheelIndex(-80, 0, 4)).toBe(3);
    expect(wheelIndex(0, -80, 0)).toBeNull();
  });
});

describe("wheelAim", () => {
  it("follows raw counts while the cursor stays put", () => {
    expect(wheelAim(0, 0, 12, -80, true)).toEqual({ dx: 12, dy: -80 });
    expect(wheelAim(2, 1, 12, -80, true)).toEqual({ dx: 12, dy: -80 });
  });

  it("follows the cursor once it leaves the center", () => {
    expect(wheelAim(80, 0, 12, -80, true)).toEqual({ dx: 80, dy: 0 });
    expect(wheelAim(0, 0, 12, -80, false)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("parseRawMouse", () => {
  it("reads a relative mouse packet and ignores other kinds", () => {
    const data = new Uint8Array(44);
    const view = new DataView(data.buffer);
    view.setUint32(0, 0, true);
    view.setInt32(36, 300, true);
    view.setInt32(40, -20, true);
    expect(parseRawMouse(data, 24)).toEqual({
      dx: 300,
      dy: -20,
      absolute: false,
      leftDown: false,
      leftUp: false,
    });
    view.setUint16(28, 0x0001, true);
    expect(parseRawMouse(data, 24)?.leftDown).toBe(true);
    view.setUint16(28, 0x0002, true);
    expect(parseRawMouse(data, 24)?.leftUp).toBe(true);
    view.setUint16(24, 1, true);
    expect(parseRawMouse(data, 24)?.absolute).toBe(true);
    view.setUint32(0, 1, true);
    expect(parseRawMouse(data, 24)).toBeNull();
    expect(parseRawMouse(data.subarray(0, 10), 24)).toBeNull();
  });
});

describe("virtualOutput", () => {
  it("recognises a cable and leaves headsets alone", () => {
    expect(virtualOutput("CABLE Input (VB-Audio Virtual Cable)")).toBe(true);
    expect(virtualOutput("Voicemeeter Aux Input")).toBe(true);
    expect(virtualOutput("Headset Earphone (HyperX Virtual Surround Sound)")).toBe(false);
    expect(virtualOutput("Speakers (Steam Streaming Speakers)")).toBe(false);
    expect(virtualOutput("")).toBe(false);
    expect(discordInputHint("CABLE Input (VB-Audio Virtual Cable)"))
      .toBe("CABLE Output (VB-Audio Virtual Cable)");
    expect(headsetOutput("Headset Earphone (HyperX Virtual Surround Sound)")).toBe(true);
    expect(headsetOutput("CABLE Input (VB-Audio Virtual Cable)")).toBe(false);
    expect(headsetOutput("Speakers (Realtek)")).toBe(false);
  });
});

describe("keyChord", () => {
  it("maps a hold key, including F-keys and modifiers", () => {
    expect(keyChord("F8")).toEqual({ vk: 0x77, ctrl: false, alt: false, shift: false });
    expect(keyChord("Ctrl+Alt+S")).toEqual({ vk: 0x53, ctrl: true, alt: true, shift: false });
    expect(keyChord("nope")).toBeNull();
  });
});
