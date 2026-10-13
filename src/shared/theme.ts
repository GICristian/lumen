export const THEME_IDS = [
  "gold",
  "grove",
  "ember",
  "tide",
  "bloom",
  "porcelain",
  "meadow",
  "harbor",
  "petal",
  "frost",
  "custom",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const MOTIFS = [
  "glow",
  "aurora",
  "embers",
  "mesh",
  "dusk",
  "daylight",
  "linen",
  "frost",
] as const;
export type Motif = (typeof MOTIFS)[number];

export const MOTIF_LABELS: Record<Motif, string> = {
  glow: "Glow",
  aurora: "Aurora",
  embers: "Embers",
  mesh: "Mesh",
  dusk: "Dusk",
  daylight: "Daylight",
  linen: "Linen",
  frost: "Frost",
};

export type ThemeMode = "dark" | "light";

export type SavedTheme = {
  id: string;
  name: string;
  themeMode: ThemeMode;
  themeMotif: Motif;
  themeBackground: string;
  themeSurface: string;
  themeAccent: string;
  themeAccent2: string;
};

export type ThemeDraft = {
  themeId: ThemeId;
  themeMode: ThemeMode;
  themeMotif: Motif;
  themeBackground: string;
  themeSurface: string;
  themeAccent: string;
  themeAccent2: string;
};

export type ThemeLook = {
  id: ThemeId;
  name: string;
  mode: ThemeMode;
  motif: Motif;
  background: string;
  surface: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
  onAccent: string;
};

type Preset = {
  name: string;
  mode: ThemeMode;
  motif: Motif;
  background: string;
  surface: string;
  accent: string;
  accent2: string;
};

export const THEME_PRESETS: Record<Exclude<ThemeId, "custom">, Preset> = {
  gold: {
    name: "Lumen",
    mode: "dark",
    motif: "glow",
    background: "#12110f",
    surface: "#1e1c19",
    accent: "#e6c18a",
    accent2: "#f2c779",
  },
  grove: {
    name: "Grove",
    mode: "dark",
    motif: "aurora",
    background: "#07140f",
    surface: "#10241c",
    accent: "#7dff6a",
    accent2: "#ffe14a",
  },
  ember: {
    name: "Ember",
    mode: "dark",
    motif: "embers",
    background: "#140808",
    surface: "#241212",
    accent: "#ff4b4b",
    accent2: "#ffb15a",
  },
  tide: {
    name: "Tide",
    mode: "dark",
    motif: "mesh",
    background: "#071018",
    surface: "#10202c",
    accent: "#4db4ff",
    accent2: "#5ce1ff",
  },
  bloom: {
    name: "Nocturne",
    mode: "dark",
    motif: "dusk",
    background: "#100814",
    surface: "#1e1224",
    accent: "#c084fc",
    accent2: "#ff7eb6",
  },
  porcelain: {
    name: "Porcelain",
    mode: "light",
    motif: "linen",
    background: "#f6f1e8",
    surface: "#fffaf4",
    accent: "#a15d16",
    accent2: "#b33b32",
  },
  meadow: {
    name: "Meadow",
    mode: "light",
    motif: "daylight",
    background: "#f3f6ee",
    surface: "#fbfdf8",
    accent: "#1c7a3e",
    accent2: "#8a6814",
  },
  harbor: {
    name: "Harbor",
    mode: "light",
    motif: "frost",
    background: "#eef3f8",
    surface: "#f8fbfe",
    accent: "#1a62ad",
    accent2: "#0c7c86",
  },
  petal: {
    name: "Petal",
    mode: "light",
    motif: "daylight",
    background: "#fbf4f6",
    surface: "#fffafb",
    accent: "#b42368",
    accent2: "#6d3eb8",
  },
  frost: {
    name: "Frost",
    mode: "light",
    motif: "mesh",
    background: "#f4f7fb",
    surface: "#ffffff",
    accent: "#1e3a5f",
    accent2: "#2457b5",
  },
};

const DARK_INK = "#161513";
const LIGHT_INK = "#f7f3ea";

export function themeId(value: unknown): ThemeId {
  return THEME_IDS.includes(value as ThemeId) ? (value as ThemeId) : "gold";
}

export function themeMode(value: unknown): ThemeMode {
  return value === "light" ? "light" : "dark";
}

export function themeMotif(value: unknown): Motif {
  return MOTIFS.includes(value as Motif) ? (value as Motif) : "glow";
}

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return `#${raw.toLowerCase()}`;
}

function channel(hex: string, index: number): number {
  return Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

export function mixHex(from: string, to: string, amount: number): string {
  const value = (index: number): string => {
    const mixed = channel(from, index) + (channel(to, index) - channel(from, index)) * amount;
    return Math.round(Math.min(255, Math.max(0, mixed))).toString(16).padStart(2, "0");
  };
  return `#${value(0)}${value(1)}${value(2)}`;
}

function luminance(hex: string): number {
  const linear = [0, 1, 2].map((index) => {
    const value = channel(hex, index) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function distance(left: string, right: string): number {
  let sum = 0;
  for (let index = 0; index < 3; index += 1) {
    const delta = channel(left, index) - channel(right, index);
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function onAccent(accent: string): string {
  return contrast(DARK_INK, accent) >= contrast(LIGHT_INK, accent) ? DARK_INK : LIGHT_INK;
}

function ink(mode: ThemeMode): { text: string; muted: string } {
  return mode === "light"
    ? { text: "#1c1915", muted: "#5e584e" }
    : { text: "#f4f0e8", muted: "#a39e94" };
}

/** Why a custom palette cannot be used, or null when the colors stay readable. */
export function themeIssue(draft: ThemeDraft): string | null {
  const { themeMode: mode, themeBackground: background, themeSurface: surface } = draft;
  const { themeAccent: accent, themeAccent2: accent2 } = draft;
  if (mode === "dark" && luminance(background) > 0.22) {
    return "That background is too light for a dark theme.";
  }
  if (mode === "light" && luminance(background) < 0.62) {
    return "That background is too dark for a light theme.";
  }
  const surfaceDark = luminance(surface) < 0.35;
  const surfaceLight = luminance(surface) > 0.75;
  if ((mode === "dark" && !surfaceDark) || (mode === "light" && !surfaceLight)) {
    return "That surface does not match the theme.";
  }
  const gap = distance(background, surface);
  if (gap < 8) return "The surface is too close to the background.";
  if (gap > 140) return "The surface is too far from the background.";
  if (contrast(accent, background) < 3) {
    return "The first color disappears on that background.";
  }
  if (contrast(accent2, background) < 3) {
    return "The second color disappears on that background.";
  }
  if (distance(accent, accent2) < 18) return "Those two colors are too close.";
  return null;
}

export function presetDraft(id: Exclude<ThemeId, "custom">): ThemeDraft {
  const preset = THEME_PRESETS[id];
  return {
    themeId: id,
    themeMode: preset.mode,
    themeMotif: preset.motif,
    themeBackground: preset.background,
    themeSurface: preset.surface,
    themeAccent: preset.accent,
    themeAccent2: preset.accent2,
  };
}

export function normalizeTheme(raw: Partial<ThemeDraft> | null): ThemeDraft {
  const id = themeId(raw?.themeId);
  const draft: ThemeDraft = {
    themeId: id,
    themeMode: themeMode(raw?.themeMode),
    themeMotif: themeMotif(raw?.themeMotif),
    themeBackground: normalizeHex(raw?.themeBackground) ?? THEME_PRESETS.gold.background,
    themeSurface: normalizeHex(raw?.themeSurface) ?? THEME_PRESETS.gold.surface,
    themeAccent: normalizeHex(raw?.themeAccent) ?? THEME_PRESETS.gold.accent,
    themeAccent2: normalizeHex(raw?.themeAccent2) ?? THEME_PRESETS.gold.accent2,
  };
  if (id === "custom" && themeIssue(draft)) return presetDraft("gold");
  return draft;
}

function lookFrom(id: Exclude<ThemeId, "custom">): ThemeLook {
  const preset = THEME_PRESETS[id];
  return {
    id,
    name: preset.name,
    mode: preset.mode,
    motif: preset.motif,
    background: preset.background,
    surface: preset.surface,
    accent: preset.accent,
    accent2: preset.accent2,
    ...ink(preset.mode),
    onAccent: onAccent(preset.accent),
  };
}

export function resolveTheme(draft: ThemeDraft): ThemeLook {
  if (draft.themeId !== "custom") return lookFrom(draft.themeId);
  if (themeIssue(draft)) return lookFrom("gold");
  return {
    id: "custom",
    name: "Custom",
    mode: draft.themeMode,
    motif: draft.themeMotif,
    background: draft.themeBackground,
    surface: draft.themeSurface,
    accent: draft.themeAccent,
    accent2: draft.themeAccent2,
    ...ink(draft.themeMode),
    onAccent: onAccent(draft.themeAccent),
  };
}

/** Layered washes. The page color sits underneath, so the motif stays transparent. */
export function sceneOf(look: Pick<ThemeLook, "motif" | "mode" | "accent" | "accent2">): string {
  const accent = `color-mix(in srgb, ${look.accent} 46%, transparent)`;
  const second = `color-mix(in srgb, ${look.accent2} 38%, transparent)`;
  const line = look.mode === "dark" ? "rgba(255,255,255,0.045)" : "rgba(28,25,21,0.055)";
  switch (look.motif) {
    case "aurora":
      return [
        `radial-gradient(70% 48% at 8% 0%, ${accent}, transparent 70%)`,
        `radial-gradient(55% 42% at 100% 6%, ${second}, transparent 68%)`,
        `radial-gradient(62% 40% at 48% 100%, ${accent}, transparent 72%)`,
      ].join(",");
    case "embers":
      return [
        `radial-gradient(34% 28% at 16% 84%, ${accent}, transparent 70%)`,
        `radial-gradient(28% 24% at 74% 14%, ${second}, transparent 70%)`,
        `radial-gradient(22% 22% at 90% 76%, ${accent}, transparent 72%)`,
        `radial-gradient(120% 46% at 50% 120%, ${second}, transparent 62%)`,
      ].join(",");
    case "mesh":
      return [
        `linear-gradient(118deg, ${accent}, transparent 42%)`,
        `linear-gradient(248deg, ${second}, transparent 46%)`,
        `radial-gradient(46% 36% at 72% 18%, ${accent}, transparent 70%)`,
      ].join(",");
    case "dusk":
      return [
        `linear-gradient(162deg, ${second}, transparent 36%)`,
        `radial-gradient(78% 52% at 16% 100%, ${accent}, transparent 62%)`,
        `radial-gradient(58% 42% at 100% 0%, ${second}, transparent 58%)`,
      ].join(",");
    case "daylight":
      return [
        `radial-gradient(90% 56% at 82% -12%, ${accent}, transparent 60%)`,
        `radial-gradient(70% 48% at 0% 108%, ${second}, transparent 64%)`,
      ].join(",");
    case "linen":
      return [
        `repeating-linear-gradient(90deg, transparent 0 42px, ${line} 42px 43px)`,
        `repeating-linear-gradient(0deg, transparent 0 42px, ${line} 42px 43px)`,
        `radial-gradient(80% 48% at 92% 0%, ${accent}, transparent 64%)`,
        `radial-gradient(64% 42% at 0% 100%, ${second}, transparent 66%)`,
      ].join(",");
    case "frost":
      return [
        `linear-gradient(180deg, ${second}, transparent 34%)`,
        `radial-gradient(42% 32% at 12% 16%, ${accent}, transparent 70%)`,
        `radial-gradient(58% 40% at 100% 84%, ${second}, transparent 68%)`,
      ].join(",");
    default:
      return [
        `radial-gradient(120% 78% at 84% -8%, ${accent}, transparent 62%)`,
        `radial-gradient(90% 68% at -8% 110%, ${second}, transparent 60%)`,
      ].join(",");
  }
}

/** Drop saved palettes that would not stay readable. */
export function normalizeSavedThemes(value: unknown): SavedTheme[] {
  if (!Array.isArray(value)) return [];
  const themes: SavedTheme[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<SavedTheme>;
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 24) : "";
    const id = typeof row.id === "string" ? row.id.trim().slice(0, 40) : "";
    if (!name || !id) continue;
    const draft: ThemeDraft = {
      themeId: "custom",
      themeMode: themeMode(row.themeMode),
      themeMotif: themeMotif(row.themeMotif),
      themeBackground: normalizeHex(row.themeBackground) ?? "",
      themeSurface: normalizeHex(row.themeSurface) ?? "",
      themeAccent: normalizeHex(row.themeAccent) ?? "",
      themeAccent2: normalizeHex(row.themeAccent2) ?? "",
    };
    if (!draft.themeBackground || !draft.themeSurface || themeIssue(draft)) continue;
    themes.push({
      id,
      name,
      themeMode: draft.themeMode,
      themeMotif: draft.themeMotif,
      themeBackground: draft.themeBackground,
      themeSurface: draft.themeSurface,
      themeAccent: draft.themeAccent,
      themeAccent2: draft.themeAccent2,
    });
    if (themes.length >= 12) break;
  }
  return themes;
}
