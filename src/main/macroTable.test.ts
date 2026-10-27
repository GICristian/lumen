import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { exampleMacroText, parseMacros } from "@shared/macros";
import { TABLE_BYTES, claimPlay, publishTable, readBind, readSteps } from "./macroTable";

function table(): Int32Array {
  return new Int32Array(new SharedArrayBuffer(TABLE_BYTES));
}

describe("macro playback table", () => {
  it("keeps the superglide order and the 6.94 ms wait", () => {
    const view = table();
    const macros = parseMacros(exampleMacroText());
    publishTable(view, macros, true, 0, () => true);
    expect(readBind(view, 67)).toBe(1);
    expect(readBind(view, 32)).toBe(0);
    const steps = readSteps(view, 0);
    expect(steps.map((step) => step.kind)).toEqual([1, 3, 1, 2, 2]);
    expect(steps[0]).toMatchObject({ device: 1, vk: 32, scan: 57, extended: 0 });
    expect(steps[1]).toMatchObject({ kind: 3, extra: 6940 });
    expect(steps[2]).toMatchObject({ device: 1, vk: 67, scan: 46 });
    expect(steps[4]).toMatchObject({ kind: 2, vk: 32 });
  });

  it("lets the bind through while the macro is paused and still reports the power key", () => {
    const view = table();
    publishTable(view, parseMacros(exampleMacroText()), false, 67, () => true);
    expect(readBind(view, 67)).toBe(-1);
    expect(readBind(view, 32)).toBe(0);
  });

  it("runs the same bind and step readers the worker threads use", () => {
    const source = [readBind, readSteps, claimPlay].map((fn) => fn.toString()).join("\n");
    expect(source).not.toContain("import");
    const context = vm.createContext({ Atomics, Int32Array, SharedArrayBuffer });
    const script = `${source}\n({ readBind, readSteps, claimPlay })`;
    const api = vm.runInContext(script, context) as {
      readBind: typeof readBind;
      readSteps: typeof readSteps;
      claimPlay: typeof claimPlay;
    };
    const view = table();
    publishTable(view, parseMacros(exampleMacroText()), true, 0, () => true);
    expect(api.readBind(view, 67)).toBe(1);
    expect(api.readSteps(view, 0)[1].extra).toBe(6940);
    const play = new Int32Array(new SharedArrayBuffer(16));
    expect(api.claimPlay(play, 0)).toBe(true);
    expect(api.claimPlay(play, 1)).toBe(false);
    expect(Atomics.load(play, 1)).toBe(0);
  });
});
