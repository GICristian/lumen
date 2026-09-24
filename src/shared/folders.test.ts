import { describe, expect, it } from "vitest";
import { folderLabels, rememberFolder } from "./folders";

describe("rememberFolder", () => {
  it("puts the newest folder first and drops duplicates", () => {
    expect(rememberFolder(["D:\\old", "D:\\keep"], "D:\\new")).toEqual([
      "D:\\new",
      "D:\\old",
      "D:\\keep",
    ]);
    expect(rememberFolder(["D:\\clips", "D:\\old"], "D:\\clips")).toEqual(["D:\\clips", "D:\\old"]);
  });

  it("keeps eight folders", () => {
    const recent = ["1", "2", "3", "4", "5", "6", "7", "8"];
    expect(rememberFolder(recent, "9")).toHaveLength(8);
    expect(rememberFolder(recent, "9")[0]).toBe("9");
  });
});

describe("folderLabels", () => {
  it("uses the parent when two folders share a name", () => {
    expect(folderLabels(["D:\\Games\\Captures", "D:\\NVIDIA\\Captures"])).toEqual([
      { path: "D:\\Games\\Captures", label: "Games / Captures" },
      { path: "D:\\NVIDIA\\Captures", label: "NVIDIA / Captures" },
    ]);
  });
});
