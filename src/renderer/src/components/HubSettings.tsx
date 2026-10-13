import { useState, useEffect } from "react";
import { acceleratorFromEvent } from "@shared/shortcut";
import {
  MOTIF_LABELS,
  MOTIFS,
  presetDraft,
  resolveTheme,
  sceneOf,
  themeIssue,
  THEME_IDS,
  THEME_PRESETS,
  type SavedTheme,
  type ThemeDraft,
  type ThemeId,
  type ThemeMode,
} from "@shared/theme";
import { Icon } from "./Icon";
import { BrandMark } from "./BrandMark";

const playerKeys = [
  ["Space", "Play or pause"],
  ["Left / Right", "Seek"],
  ["Shift + arrows", "Seek further"],
  ["Up / Down", "Volume"],
  ["I / O", "Mark the trim"],
  ["F", "Fullscreen"],
  ["L", "Loop"],
  ["M", "Library"],
  ["Enter", "Export the span"],
  ["Escape", "Leave fullscreen"],
];

type Bind = "overlay" | "vault" | "screenshot";

type Props = {
  overlayShortcut: string;
  vaultShortcut: string;
  screenshotShortcut: string;
  launchOnStartup: boolean;
  cursorSize: number;
  theme: ThemeDraft;
  savedThemes: SavedTheme[];
  activeSavedId: string | null;
  onSaveTheme: (name: string) => Promise<void>;
  onApplySaved: (theme: SavedTheme) => Promise<void>;
  onDeleteSaved: (id: string) => Promise<void>;
  onCursorSize: (size: number) => void;
  exportDirectory: string | null;
  onExportDirectory: () => void;
  onShortcut: (which: Bind, accelerator: string) => Promise<void>;
  onTheme: (draft: ThemeDraft) => Promise<void>;
  onLaunch: (enabled: boolean) => Promise<void>;
  onReplay: () => void;
};

export function HubSettings({
  overlayShortcut,
  vaultShortcut,
  screenshotShortcut,
  launchOnStartup,
  cursorSize,
  theme,
  savedThemes,
  activeSavedId,
  onSaveTheme,
  onApplySaved,
  onDeleteSaved,
  onCursorSize,
  exportDirectory,
  onExportDirectory,
  onShortcut,
  onTheme,
  onLaunch,
  onReplay,
}: Props) {
  const [section, setSection] = useState<"appearance" | "controls" | "storage">("appearance");
  const [bind, setBind] = useState<Bind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [themeNote, setThemeNote] = useState<string | null>(null);
  const [themeName, setThemeName] = useState("");

  useEffect(() => {
    if (!bind) return;
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setBind(null);
        return;
      }
      const next = acceleratorFromEvent(event);
      if (!next) return;
      const which = bind;
      setBind(null);
      void onShortcut(which, next).catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : "Shortcut was not saved");
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [bind, onShortcut]);

  const look = resolveTheme(theme);
  const darkIds = THEME_IDS.filter((id): id is Exclude<ThemeId, "custom"> =>
    id !== "custom" && THEME_PRESETS[id].mode === "dark");
  const lightIds = THEME_IDS.filter((id): id is Exclude<ThemeId, "custom"> =>
    id !== "custom" && THEME_PRESETS[id].mode === "light");

  function commit(next: ThemeDraft): void {
    if (next.themeId === "custom") {
      const issue = themeIssue(next);
      setThemeNote(issue);
      if (issue) return;
    } else {
      setThemeNote(null);
    }
    void onTheme(next).catch((error: unknown) => setThemeNote(error instanceof Error ? error.message : "Theme could not be saved."));
  }

  function customize(patch: Partial<ThemeDraft>): void {
    commit({
      themeId: "custom",
      themeMode: look.mode,
      themeMotif: look.motif,
      themeBackground: look.background,
      themeSurface: look.surface,
      themeAccent: look.accent,
      themeAccent2: look.accent2,
      ...patch,
    });
  }

  function chooseMode(mode: ThemeMode): void {
    if (mode === look.mode) return;
    const draft: ThemeDraft = {
      themeId: "custom",
      themeMode: mode,
      themeMotif: look.motif,
      themeBackground: look.background,
      themeSurface: look.surface,
      themeAccent: look.accent,
      themeAccent2: look.accent2,
    };
    if (!themeIssue(draft)) {
      commit(draft);
      return;
    }
    const seeded = mode === "light" ? "porcelain" : "gold";
    commit({ ...presetDraft(seeded), themeId: "custom" });
  }

  return (
    <div className="settings-workbench">
      <aside className="settings-navigation">
        <span className="hub-kicker">LUMEN / PREFERENCES</span>
        <h1>Make it yours.</h1>
        <p>A space that feels like you.</p>
        <nav aria-label="Settings categories">
          {([
            ["appearance", "Appearance", "Your palette & atmosphere", "star"],
            ["controls", "Controls", "Shortcuts & behavior", "gear"],
            ["storage", "Storage", "Where your work lives", "folder"],
          ] as const).map(([id, label, note, icon]) => (
            <button key={id} type="button" aria-current={section === id ? "page" : undefined} onClick={() => { setBind(null); setSection(id); }}>
              <Icon name={icon} /><span><strong>{label}</strong><small>{note}</small></span><span aria-hidden="true">›</span>
            </button>
          ))}
          <button type="button" onClick={onReplay}><Icon name="record" /><span><strong>Replay & capture</strong><small>Picture, sound & buffer</small></span><span aria-hidden="true">↗</span></button>
        </nav>
        <div className="settings-signature"><BrandMark /><span><strong>{look.name}</strong><small>{look.mode === "dark" ? "Dark" : "Light"} atmosphere · {MOTIF_LABELS[look.motif]}</small></span></div>
      </aside>
      <div className="settings-content" key={section}>
      <header className="settings-page-heading"><div><span className="hub-kicker">{section === "appearance" ? "01 / PERSONALIZE" : section === "controls" ? "02 / INTERACT" : "03 / ORGANIZE"}</span><h2>{section === "appearance" ? "Your signature." : section === "controls" ? "At your fingertips." : "A place for every moment."}</h2></div><span className="settings-autosave"><i /> Changes save automatically</span></header>
      <div className="hub-panel is-settings">
      <section className="hub-sheet" hidden={section !== "controls"}>
        <span className="hub-kicker">Keybinds</span>
        <h2>Shortcuts</h2>
        <p className="hub-note">
          One key, or two or three with Ctrl, Alt, and Shift in any mix.
          A lone letter is caught in every program.
        </p>
        <button
          type="button"
          className="bind-row"
          onClick={() => {
            setNotice(null);
            setBind("overlay");
          }}
        >
          <span>Overlay</span>
          <strong>{bind === "overlay" ? "Press a shortcut" : overlayShortcut}</strong>
        </button>
        <button
          type="button"
          className="bind-row"
          onClick={() => {
            setNotice(null);
            setBind("vault");
          }}
        >
          <span>Vault</span>
          <strong>{bind === "vault" ? "Press a shortcut" : vaultShortcut}</strong>
        </button>
        <button
          type="button"
          className="bind-row"
          onClick={() => {
            setNotice(null);
            setBind("screenshot");
          }}
        >
          <span>Screenshot</span>
          <strong>{bind === "screenshot" ? "Press a shortcut" : screenshotShortcut}</strong>
        </button>
        {notice ? <p className="hub-note is-warn">{notice}</p> : null}
      </section>
      <section className="hub-sheet is-wide" hidden={section !== "appearance"}>
        <span className="hub-kicker">Appearance</span>
        <h2>Color, with character.</h2>
        <p className="hub-note">
          A considered collection of palettes. Every surface, control and detail follows your choice.
        </p>
        <div
          className="gx-preview"
          style={{
            backgroundColor: look.background,
            backgroundImage: sceneOf(look),
            color: look.text,
          }}
        >
          <div className="gx-preview-bar" style={{ background: look.surface }}>
            <BrandMark className="gx-mark" />
            <strong>{look.name}</strong>
            <span>{look.mode === "light" ? "Light" : "Dark"}</span>
          </div>
          <div className="gx-preview-copy"><span>THE PERSONAL PICTURE HOUSE</span><strong>Every moment.<br />In your own light.</strong><small>{MOTIF_LABELS[look.motif]} / {look.name}</small></div>
          <div className="gx-preview-card" style={{ background: look.surface, color: look.text }}>
            <i className="gx-preview-play" style={{ background: look.accent }} />
            <span className="gx-preview-line">
              <i style={{ background: look.accent2 }} />
            </span>
          </div>
        </div>
        <div className="gx-groups">
          <div>
            <h3>Dark</h3>
            <ThemeCards
              ids={darkIds}
              selected={theme.themeId}
              onPick={(id) => commit(presetDraft(id))}
            />
          </div>
          <div>
            <h3>Light</h3>
            <ThemeCards
              ids={lightIds}
              selected={theme.themeId}
              onPick={(id) => commit(presetDraft(id))}
            />
          </div>
        </div>
        <details className="theme-custom-disclosure"><summary><span><strong>Design your own</strong><small>Atmosphere, surfaces and accent colors</small></span><span aria-hidden="true">+</span></summary>
        <div className="gx-custom">
          <div className="gx-row">
            {(["dark", "light"] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={look.mode === mode ? "gx-chip is-on" : "gx-chip"}
                onClick={() => chooseMode(mode)}
              >
                {mode === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
          <div className="gx-motifs">
            {MOTIFS.map((motif) => (
              <button
                key={motif}
                type="button"
                className={look.motif === motif ? "gx-motif is-on" : "gx-motif"}
                aria-pressed={look.motif === motif}
                onClick={() => {
                  if (motif !== look.motif) customize({ themeMotif: motif });
                }}
              >
                <i
                  style={{
                    backgroundColor: look.background,
                    backgroundImage: sceneOf({ ...look, motif }),
                  }}
                />
                <span>{MOTIF_LABELS[motif]}</span>
              </button>
            ))}
          </div>
          <div className="gx-row">
            <ColorField
              label="Background"
              value={look.background}
              onChange={(value) => customize({ themeBackground: value })}
            />
            <ColorField
              label="Surface"
              value={look.surface}
              onChange={(value) => customize({ themeSurface: value })}
            />
            <ColorField
              label="Accent"
              value={look.accent}
              onChange={(value) => customize({ themeAccent: value })}
            />
            <ColorField
              label="Second"
              value={look.accent2}
              onChange={(value) => customize({ themeAccent2: value })}
            />
          </div>
        </div>
        </details>
        {savedThemes.length > 0 ? (
          <div className="gx-saved">
            <h3>Saved</h3>
            <div className="gx-grid">
              {savedThemes.map((saved) => (
                <div className="gx-saved-item" key={saved.id}>
                  <button type="button" className={activeSavedId === saved.id ? "gx-card is-on" : "gx-card"}
                    aria-pressed={activeSavedId === saved.id}
                    onClick={() => void onApplySaved(saved).catch(() => setThemeNote("Theme could not be applied."))}>
                    <i style={{ backgroundColor: saved.themeBackground, backgroundImage: sceneOf({ motif: saved.themeMotif, mode: saved.themeMode, accent: saved.themeAccent, accent2: saved.themeAccent2 }) }} />
                    <span>{saved.name}</span>
                  </button>
                  <button type="button" className="gx-delete" aria-label={`Delete ${saved.name}`}
                    onClick={() => void onDeleteSaved(saved.id).catch(() => setThemeNote("Theme could not be deleted."))}>×</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <form
          className="gx-save"
          onSubmit={(event) => {
            event.preventDefault();
            const name = themeName.trim();
            if (!name) return;
            void onSaveTheme(name).then(() => setThemeName("")).catch(() => setThemeNote("Theme could not be saved. Please try again."));
          }}
        >
          <input
            value={themeName}
            maxLength={24}
            placeholder="Name this theme"
            aria-label="Saved theme name"
            onChange={(event) => setThemeName(event.target.value)}
          />
          <button type="submit" disabled={!themeName.trim()}>
            Save theme
          </button>
        </form>
        {themeNote ? <p className="hub-note is-warn">{themeNote}</p> : null}
        <label className="cursor-setting">
          <span>Cursor size</span>
          <input
            type="range"
            min={16}
            max={40}
            step={2}
            value={cursorSize}
            aria-label="Cursor size"
            onChange={(event) => onCursorSize(Number(event.target.value))}
          />
          <strong>{cursorSize}px</strong>
        </label>
      </section>
      <section className="hub-sheet" hidden={section !== "controls"}>
        <span className="hub-kicker">Startup</span>
        <button
          type="button"
          className="bind-row"
          onClick={() => void onLaunch(!launchOnStartup)}
        >
          <span>Open in the tray when Windows starts</span>
          <strong>{launchOnStartup ? "On" : "Off"}</strong>
        </button>
      </section>
      <section className="hub-sheet" hidden={section !== "storage"}>
        <span className="hub-kicker">Export</span>
        <h2>Save destination</h2>
        <button type="button" className="bind-row" onClick={onExportDirectory}>
          <span className="export-location">{exportDirectory ?? "Choose a default folder"}</span>
          <strong>Change</strong>
        </button>
        <p className="hub-note">Lumen remembers this folder for every video export.</p>
      </section>
      <section className="hub-sheet" hidden={section !== "controls"}>
        <span className="hub-kicker">Player</span>
        <h2>Keys while a video is open</h2>
        <ul className="key-list">
          {playerKeys.map(([key, label]) => (
            <li key={key}>
              <span>{label}</span>
              <strong>{key}</strong>
            </li>
          ))}
        </ul>
      </section>
      </div>
      </div>
    </div>
  );
}

function ThemeCards({
  ids,
  selected,
  onPick,
}: {
  ids: Exclude<ThemeId, "custom">[];
  selected: ThemeId;
  onPick: (id: Exclude<ThemeId, "custom">) => void;
}) {
  return (
    <div className="gx-grid">
      {ids.map((id) => {
        const preset = THEME_PRESETS[id];
        const art = sceneOf(resolveTheme(presetDraft(id)));
        return (
          <button
            key={id}
            type="button"
            className={selected === id ? "gx-card is-on" : "gx-card"}
            aria-pressed={selected === id}
            onClick={() => onPick(id)}
          >
            <i style={{ backgroundColor: preset.background, backgroundImage: art }} />
            <span>{preset.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="gx-color">
      {label}
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
