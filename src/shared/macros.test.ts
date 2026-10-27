import { describe, expect, it } from "vitest";
import { bindConflicts, describeMacro, parseMacros, sanitizeMacros, serializeMacros } from "./macros";

const SAVED = [
  "# Macro Bind",
  "macro",
  "name=Space C",
  "enabled=1",
  "bind=key 67 46 0 C",
  "step=key down 32 57 0 Space",
  "step=wait 6.94",
  "step=key down 67 46 0 C",
  "step=key up 67 46 0 C",
  "step=key up 32 57 0 Space",
].join("\n");

describe("macro file", () => {
  it("keeps the Space C timing from Macro Bind", () => {
    const [macro] = parseMacros(SAVED);
    expect(macro.bindVk).toBe(67);
    expect(macro.bindName).toBe("C");
    expect(macro.steps[1].milliseconds).toBeCloseTo(6.94);
    expect(macro.steps[0].vk).toBe(32);
    expect(describeMacro(macro)).toContain("Space down");
    const again = parseMacros(serializeMacros([macro]));
    expect(again[0].steps[1].milliseconds).toBeCloseTo(6.94);
  });

  it("does not treat a modified shortcut as the same bind", () => {
    const [macro] = parseMacros(SAVED);
    expect(bindConflicts(macro, "C")).toBe(true);
    expect(bindConflicts(macro, "Ctrl+Alt+Shift+R")).toBe(false);
    expect(bindConflicts(macro, "Ctrl+Shift+S")).toBe(false);
  });

  it("keeps an edited bind and its wait", () => {
    const [saved] = sanitizeMacros([{
      name: "  Tap  ",
      enabled: true,
      bindKind: "key",
      bindVk: 67,
      bindScan: 0,
      bindExtended: false,
      bindMouse: "",
      bindName: "C",
      steps: [
        { kind: "down", device: "key", vk: 32, scan: 0, extended: false, mouse: "", name: "Space", milliseconds: 0 },
        { kind: "wait", device: "time", vk: 0, scan: 0, extended: false, mouse: "", name: "", milliseconds: 6.94 },
      ],
    }]);
    expect(saved.name).toBe("Tap");
    expect(saved.steps[1].milliseconds).toBeCloseTo(6.94);
    expect(parseMacros(serializeMacros([saved]))[0].bindName).toBe("C");
  });
});
