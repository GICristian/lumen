import { describe, expect, it } from "vitest";
import { replayFolderName } from "./captureFolder";

const apex = "D:/Steam/steamapps/common/Apex Legends/r5apex_dx12.exe";
const rematch = "D:/Steam/steamapps/common/Rematch/Runtime/Binaries/Win64/RuntimeClient-Win64-Shipping.exe";

describe("replayFolderName", () => {
  it("keeps games, and puts browsers and chat apps in Desktop", () => {
    expect(replayFolderName("osu!")).toBe("osu!");
    expect(replayFolderName("chrome")).toBe("Desktop");
    expect(replayFolderName("explorer")).toBe("Desktop");
    expect(replayFolderName("brave", "Brave Browser")).toBe("Desktop");
    expect(replayFolderName("Discord", "Discord")).toBe("Desktop");
    expect(replayFolderName(null)).toBe("Desktop");
    expect(replayFolderName("osu!", "bad:name")).toBe("badname");
    expect(replayFolderName("r5apex_dx12", "Apex Legends", apex)).toBe("Apex Legends");
    expect(replayFolderName("RuntimeClient-Win64-Shipping", "Rematch", rematch)).toBe("Rematch");
  });
});
