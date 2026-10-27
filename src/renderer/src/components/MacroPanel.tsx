import { useEffect, useState } from "react";
import type { Settings } from "@shared/contracts";
import type { MacroCard } from "@shared/macros";

export function MacroPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [macros, setMacros] = useState<MacroCard[]>([]);

  useEffect(() => {
    void window.lumen.getSettings().then(setSettings);
    return window.lumen.onTheme(setSettings);
  }, []);

  useEffect(() => {
    const load = (): void => {
      void window.lumen.macroLibrary().then((library) => setMacros(library.macros));
    };
    load();
    return window.lumen.onMacroChanged(load);
  }, [settings?.macroEnabled, settings?.macroLive]);

  if (!settings) return null;
  const enabled = settings.macroEnabled;
  return (
    <section className="hub-sheet soundboard-panel plugin-card">
      <header className="plugin-head">
        <div>
          <span className="hub-kicker">02 / Macro Bind</span>
          <h2>Macros</h2>
        </div>
        <button
          type="button"
          className={enabled ? "plugin-toggle is-on" : "plugin-toggle"}
          onClick={() => {
            void window.lumen.setMacroEnabled(!enabled).then(setSettings);
          }}
        >
          <i />
          {enabled ? "On" : "Off"}
        </button>
      </header>
      <p className="hub-note">
        Edit the keyboard in its own window. Macros keep running from the tray
        while Lumen is hidden. Clip, screenshot and overlay shortcuts are left alone.
      </p>
      <button
        type="button"
        className="macro-open"
        onClick={() => { void window.lumen.openMacroEditor(); }}
      >
        Open editor
      </button>
      <button
        type="button"
        className={settings.macroLive ? "plugin-switch is-on" : "plugin-switch"}
        aria-pressed={settings.macroLive}
        disabled={!enabled}
        onClick={() => {
          void window.lumen.setMacroLive(!settings.macroLive).then(setSettings);
        }}
      >
        <span>
          Live
          <small>
            {settings.macroLive
              ? "The bind is armed. Press it in a game to play the sequence."
              : "Off. The bind does nothing until you arm it."}
          </small>
        </span>
        <i />
      </button>
      <ul className="plugin-sounds is-macros">
        {macros.length === 0 ? <li className="is-empty">No macros yet.</li> : null}
        {macros.map((macro) => (
          <li key={macro.name}>
            <strong>{macro.name}</strong>
            <span> · {macro.bind}</span>
            <small>{macro.summary}</small>
            {macro.blocked ? <small>Bind matches {macro.blocked}. It stays disarmed.</small> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
