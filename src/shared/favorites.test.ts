import { describe, expect, it } from "vitest";
import {
  dropFavorites,
  isFavorite,
  normalizeFavorites,
  replacePathPrefix,
  toggleFavorite,
} from "./favorites";

describe("favorites", () => {
  it("matches a path when only the slash style or case changes", () => {
    const saved = toggleFavorite([], "D:/Videos/osu!/clip.mp4");
    expect(isFavorite(saved, "d:\\videos\\osu!\\clip.mp4")).toBe(true);
    expect(toggleFavorite(saved, "D:\\Videos\\osu!\\clip.mp4")).toEqual([]);
  });

  it("drops deleted paths and ignores junk in a saved list", () => {
    const saved = normalizeFavorites(["C:/a.mp4", "c:/a.mp4", 4, "  "]);
    expect(saved).toEqual(["C:/a.mp4"]);
    expect(dropFavorites(saved, ["c:\\a.mp4"])).toEqual([]);
  });

  it("keeps the file name when a replay folder is renamed", () => {
    const from = "C:/Users/gavra/Videos/Lumen/r5apex_dx12";
    const to = "C:/Users/gavra/Videos/Lumen/Apex Legends";
    expect(replacePathPrefix(`${from}/clip.mp4`, from, to)).toBe(
      "C:\\Users\\gavra\\Videos\\Lumen\\Apex Legends\\clip.mp4",
    );
    expect(replacePathPrefix("C:/other/clip.mp4", from, to)).toBe("C:/other/clip.mp4");
  });
});
