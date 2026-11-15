import { describe, expect, it } from "vitest";
import { bindConflicts, describeMacro, parseMacros, sanitizeMacros, serializeMacros } from "./macros";

const SAVED = [
  "# Macro Bind",
  "macro",
  "name=WoW Mount",
  "enabled=1",
  "bind=key 84 20 0 T",
  "step=key down 49 2 0 1",
  "step=wait 40",
  "step=key up 49 2 0 1",
].join("\n");

describe("macro file", () => {
  it("keeps the WoW mount timing from Macro Bind", () => {
    const [macro] = parseMacros(SAVED);
    expect(macro.bindVk).toBe(84);
    expect(macro.bindName).toBe("T");
    expect(macro.steps[1].milliseconds).toBeCloseTo(40);
    expect(macro.steps[0].vk).toBe(49);
    expect(describeMacro(macro)).toContain("1 down");
    const again = parseMacros(serializeMacros([macro]));
    expect(again[0].steps[1].milliseconds).toBeCloseTo(40);
  });

  it("does not treat a modified shortcut as the same bind", () => {
    const [macro] = parseMacros(SAVED);
    expect(bindConflicts(macro, "T")).toBe(true);
    expect(bindConflicts(macro, "Ctrl+Alt+Shift+R")).toBe(false);
    expect(bindConflicts(macro, "Ctrl+Shift+S")).toBe(false);
  });

  it("keeps an edited bind and its wait", () => {
    const [saved] = sanitizeMacros([{
      name: "  Mount  ",
      enabled: true,
      bindKind: "key",
      bindVk: 84,
      bindScan: 0,
      bindExtended: false,
      bindMouse: "",
      bindName: "T",
      steps: [
        { kind: "down", device: "key", vk: 49, scan: 2, extended: false, mouse: "", name: "1", milliseconds: 0 },
        { kind: "wait", device: "time", vk: 0, scan: 0, extended: false, mouse: "", name: "", milliseconds: 40 },
      ],
    }]);
    expect(saved.name).toBe("Mount");
    expect(saved.steps[1].milliseconds).toBeCloseTo(40);
    expect(parseMacros(serializeMacros([saved]))[0].bindName).toBe("T");
  });
});
