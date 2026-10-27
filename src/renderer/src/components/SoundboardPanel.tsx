import { useEffect, useState } from "react";
import { acceleratorFromEvent } from "@shared/shortcut";
import type { Settings } from "@shared/contracts";
import { type SoundClip } from "@shared/plugins";

const reservedNames: [keyof Settings, string][] = [
  ["overlayAccelerator", "Overlay"],
  ["vaultAccelerator", "Vault"],
  ["replayAccelerator", "Replay"],
  ["screenshotAccelerator", "Screenshot"],
];

export function SoundboardPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sounds, setSounds] = useState<SoundClip[]>([]);
  const [folder, setFolder] = useState("");
  const [bind, setBind] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void window.lumen.getSettings().then(setSettings);
    return window.lumen.onTheme(setSettings);
  }, []);

  useEffect(() => {
    const load = (): void => {
      void window.lumen.soundboardSounds().then((library) => {
        setSounds(library.sounds);
        setFolder(library.folder);
      });
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  useEffect(() => {
    if (!bind || !settings) return;
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setBind(false);
        return;
      }
      const next = acceleratorFromEvent(event);
      if (!next) return;
      const taken = reservedNames.find(([key]) => settings[key] === next);
      if (taken) {
        setNotice(`${next} is already used by ${taken[1]}.`);
        setBind(false);
        return;
      }
      setNotice(null);
      setBind(false);
      void window.lumen.setSettings({ soundboardAccelerator: next }).then(setSettings);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [bind, settings]);

  if (!settings) return null;
  const enabled = settings.soundboardEnabled;
  return (
    <section className="hub-sheet soundboard-panel plugin-card">
      <header className="plugin-head">
        <div>
          <span className="hub-kicker">01 / Hold to play</span>
          <h2>Soundboard</h2>
        </div>
        <button
          type="button"
          className={enabled ? "plugin-toggle is-on" : "plugin-toggle"}
          onClick={() => {
            void window.lumen.setSettings({ soundboardEnabled: !enabled }).then(setSettings);
          }}
        >
          <i />
          {enabled ? "On" : "Off"}
        </button>
      </header>
      <p className="hub-note">
        Hold the key anywhere. Aim, then release on a slice.
        Sounds play on your headset only. Discord keeps your real microphone —
        Lumen does not open it, so voice stays clean and PC volume stays full.
      </p>
      <button
        type="button"
        className="bind-row"
        onClick={() => { setNotice(null); setBind(true); }}
      >
        <span>{bind ? "Press a key" : "Hold key"}</span>
        <strong>{settings.soundboardAccelerator}</strong>
      </button>
      {notice ? <p className="hub-note">{notice}</p> : null}
      <label className="bind-row">
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.soundboardVolume}
          aria-label="Soundboard volume"
          onChange={(event) => {
            const soundboardVolume = Number(event.target.value);
            void window.lumen.setSettings({ soundboardVolume }).then(setSettings);
          }}
        />
        <strong>{Math.round(settings.soundboardVolume * 100)}%</strong>
      </label>
      <button
        type="button"
        className="bind-row"
        onClick={() => void window.lumen.soundboardFolder()}
      >
        <span className="export-location">{folder || "Sounds folder"}</span>
        <strong>Open</strong>
      </button>
      <ul className="plugin-sounds">
        {sounds.length === 0 ? <li className="is-empty">No sounds in the folder yet.</li> : null}
        {sounds.map((sound) => (
          <li key={sound.path}>{sound.name}</li>
        ))}
      </ul>
    </section>
  );
}
