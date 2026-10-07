import { describe, expect, it } from "vitest";
import { filterLumenFolders, folderRecency, sortLumenFolders, type LumenFolder } from "./lumenFolders";

const folders: LumenFolder[] = [
  { name: "Desktop", directory: "C:/Lumen/Desktop", savedAt: 10, iconPath: null },
  { name: "osu!", directory: "C:/Lumen/osu!", savedAt: 30, iconPath: "C:/icons/osu.png" },
  { name: "discord", directory: "C:/Lumen/discord", savedAt: 20, iconPath: "C:/icons/discord.png" },
];

describe("lumen folders", () => {
  it("puts the latest save first and marks older folders apart from it", () => {
    const sorted = sortLumenFolders(folders);
    expect(sorted.map((folder) => folder.name)).toEqual(["osu!", "discord", "Desktop"]);
    expect(folderRecency(0)).toBe("newest");
    expect(folderRecency(1)).toBe("recent");
    expect(folderRecency(2)).toBe("older");
  });

  it("filters the folder browser by name", () => {
    expect(filterLumenFolders(folders, "os").map((folder) => folder.name)).toEqual(["osu!"]);
  });
});
