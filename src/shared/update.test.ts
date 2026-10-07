import { describe, expect, it } from "vitest";
import { idleUpdate, updateLabel, updateTitle, updateVisible } from "./update";

describe("update banner", () => {
  it("stays hidden until a release is newer", () => {
    expect(updateVisible(idleUpdate)).toBe(false);
    expect(updateVisible({ ...idleUpdate, phase: "available", version: "0.2.2" })).toBe(true);
    expect(updateVisible({
      ...idleUpdate,
      phase: "available",
      version: "0.2.2",
      dismissed: true,
    })).toBe(false);
  });

  it("names the release and shows download progress", () => {
    const available = { ...idleUpdate, phase: "available" as const, version: "0.2.2" };
    expect(updateTitle(available)).toBe("Lumen 0.2.2 is available");
    expect(updateLabel(available)).toBe("Update");
    const downloading = { ...available, phase: "downloading" as const, percent: 41.6 };
    expect(updateTitle(downloading)).toBe("Installing 0.2.2");
    expect(updateLabel(downloading)).toBe("Downloading 42%");
    expect(updateLabel({ ...downloading, percent: Number.NaN })).toBe("Downloading 0%");
  });

  it("keeps a failed download short enough to retry", () => {
    const failed = {
      ...idleUpdate,
      phase: "error" as const,
      version: "0.2.2",
      message: `${"x".repeat(200)}\nmore`,
    };
    expect(updateTitle(failed).endsWith("...")).toBe(true);
    expect(updateTitle(failed).length).toBeLessThanOrEqual(120);
    expect(updateLabel(failed)).toBe("Try again");
  });
});
