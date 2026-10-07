import { describe, expect, it } from "vitest";
import { displayAppName } from "./appTitle";

describe("displayAppName", () => {
  it("uses the store folder when the executable name is an engine binary", () => {
    const rematch = "D:/Steam/steamapps/common/Rematch/Runtime/Binaries/Win64/RuntimeClient-Win64-Shipping.exe";
    const apex = "D:/Steam/steamapps/common/Apex Legends/r5apex_dx12.exe";
    expect(displayAppName("RuntimeClient-Win64-Shipping", rematch, "")).toBe("Rematch");
    expect(displayAppName("r5apex_dx12", apex, "Apex Legends")).toBe("Apex Legends");
  });

  it("keeps a readable executable name", () => {
    expect(displayAppName("osu!", "C:/osulazer/current/osu!.exe", "osu!(lazer)")).toBe("osu!");
    expect(displayAppName("brave", "C:/Brave/Application/brave.exe", "Brave Browser")).toBe("brave");
  });
});
