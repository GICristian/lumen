import { describe, expect, it } from "vitest";
import {
  normalizeSavedThemes,
  presetDraft,
  resolveTheme,
  sceneOf,
  themeIssue,
  THEME_IDS,
  type ThemeDraft,
} from "./theme";

function custom(patch: Partial<ThemeDraft>): ThemeDraft {
  return { ...presetDraft("gold"), themeId: "custom", ...patch };
}

describe("themeIssue", () => {
  it("accepts every named theme", () => {
    for (const id of THEME_IDS) {
      if (id === "custom") continue;
      expect(themeIssue(presetDraft(id))).toBeNull();
    }
  });

  it("rejects unreadable custom palettes", () => {
    expect(themeIssue(custom({ themeAccent: "#1a1a1a" }))).toMatch(/first color/);
    expect(themeIssue(custom({ themeAccent2: "#111111" }))).toMatch(/second color/);
    expect(themeIssue(custom({ themeAccent2: "#e7c08b" }))).toMatch(/too close/);
    expect(themeIssue(custom({ themeBackground: "#f4efe6" }))).toMatch(/too light/);
    expect(themeIssue(custom({
      themeMode: "light",
      themeBackground: "#111111",
      themeSurface: "#ffffff",
      themeAccent: "#1c7a3e",
      themeAccent2: "#8a6814",
    }))).toMatch(/too dark/);
  });
});

describe("resolveTheme", () => {
  it("uses the named palette and falls back when a custom one is unusable", () => {
    const ember = resolveTheme({ ...presetDraft("ember"), themeAccent: "#000000" });
    expect(ember.name).toBe("Ember");
    expect(ember.accent).toBe("#ff4b4b");
    expect(ember.mode).toBe("dark");
    const meadow = resolveTheme(presetDraft("meadow"));
    expect(meadow.name).toBe("Meadow");
    expect(meadow.mode).toBe("light");
    expect(resolveTheme(custom({
      themeAccent: "#7dff6a",
      themeAccent2: "#ffe14a",
    })).id).toBe("custom");
    expect(resolveTheme(custom({ themeAccent: "#101010", themeAccent2: "#111111" })).id).toBe("gold");
  });

  it("keeps a readable saved palette and drops a broken one", () => {
    const saved = normalizeSavedThemes([
      { ...presetDraft("porcelain"), id: "a", name: "Dawn" },
      { id: "b", name: "Mud", themeMode: "light", themeBackground: "#111111" },
      { id: "", name: "Nope" },
    ]);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("Dawn");
  });

  it("paints a different atmosphere for each motif", () => {
    const glow = sceneOf(resolveTheme(presetDraft("gold")));
    const aurora = sceneOf(resolveTheme(presetDraft("grove")));
    expect(glow).toContain("radial-gradient");
    expect(aurora).not.toBe(glow);
    expect(sceneOf(resolveTheme(presetDraft("porcelain")))).toContain("repeating-linear-gradient");
  });
});
