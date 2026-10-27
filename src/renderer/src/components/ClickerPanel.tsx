import { useEffect, useState } from "react";
import type { Settings } from "@shared/contracts";

export function ClickerPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void window.lumen.getSettings().then(setSettings);
    return window.lumen.onTheme(setSettings);
  }, []);

  if (!settings) return null;
  const enabled = settings.clickerEnabled;
  return (
    <section className="hub-sheet soundboard-panel plugin-card">
      <header className="plugin-head">
        <div>
          <span className="hub-kicker">04 / Autoclicker</span>
          <h2>Autoclicker</h2>
        </div>
        <button
          type="button"
          className={enabled ? "plugin-toggle is-on" : "plugin-toggle"}
          onClick={() => {
            void window.lumen.setSettings({ clickerEnabled: !enabled }).then(setSettings);
          }}
        >
          <i />
          {enabled ? "On" : "Off"}
        </button>
      </header>
      <p className="hub-note">
        Repeats a mouse button on a timer. Set the button, the gap and the
        toggle key in its own window. Clicks start once you leave Lumen.
      </p>
      <button
        type="button"
        className="macro-open"
        onClick={() => { void window.lumen.openClickerSettings(); }}
      >
        Settings
      </button>
    </section>
  );
}
