import type { Settings } from "@shared/contracts";
import { mixHex, resolveTheme, sceneOf } from "@shared/theme";
import { lumenCursor } from "./cursor";

export function applyTheme(settings: Pick<
  Settings,
  | "themeId"
  | "themeMode"
  | "themeMotif"
  | "themeBackground"
  | "themeSurface"
  | "themeAccent"
  | "themeAccent2"
  | "cursorSize"
>): void {
  const theme = resolveTheme(settings);
  const root = document.documentElement;
  const raised = mixHex(theme.surface, theme.mode === "dark" ? "#ffffff" : "#000000", 0.06);
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  root.style.colorScheme = theme.mode;
  root.style.setProperty("--bg", theme.background);
  root.style.setProperty("--surface", theme.surface);
  root.style.setProperty("--surface-raised", raised);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-2", theme.accent2);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--muted", theme.muted);
  root.style.setProperty("--on-accent", theme.onAccent);
  root.style.setProperty("--scene", sceneOf(theme));
  root.style.setProperty(
    "--line",
    "color-mix(in srgb, var(--text) 14%, transparent)",
  );
  root.style.setProperty(
    "--lumen-cursor",
    lumenCursor(settings.cursorSize, theme.accent, theme.accent2),
  );
}
