import { useEffect, useState } from "react";
import type { Settings } from "@shared/contracts";

export function PerfPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void window.lumen.getSettings().then(setSettings);
    return window.lumen.onTheme(setSettings);
  }, []);

  if (!settings) return null;
  const enabled = settings.perfEnabled;
  return (
    <section className="hub-sheet soundboard-panel plugin-card">
      <header className="plugin-head">
        <div>
          <span className="hub-kicker">03 / Performance</span>
          <h2>Performance</h2>
        </div>
        <button
          type="button"
          className={enabled ? "plugin-toggle is-on" : "plugin-toggle"}
          onClick={() => {
            void window.lumen.setSettings({ perfEnabled: !enabled }).then(setSettings);
          }}
        >
          <i />
          {enabled ? "On" : "Off"}
        </button>
      </header>
      <p className="hub-note">
        A thin line for FPS, processor, graphics and memory, in the theme colors.
        Place it and fade it from its own window. It never takes the mouse.
      </p>
      <button
        type="button"
        className="macro-open"
        onClick={() => { void window.lumen.openPerfSettings(); }}
      >
        Settings
      </button>
    </section>
  );
}
