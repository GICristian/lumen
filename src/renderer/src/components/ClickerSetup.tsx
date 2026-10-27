import { useEffect, useState } from "react";
import type { ClickerState, Settings } from "@shared/contracts";
import { clickerInterval, type ClickerButton } from "@shared/clicker";
import { WindowControls } from "./WindowChrome";

const BUTTONS: { id: ClickerButton; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "middle", label: "Middle" },
];

function keyName(event: KeyboardEvent): string {
  if (event.key === " ") return "Space";
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}

/** Autoclicker window. Clicks are sent only while Lumen is in the background. */
export function ClickerSetup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<ClickerState>({ running: false, holding: false });
  const [gap, setGap] = useState("50");
  const [listen, setListen] = useState(false);

  useEffect(() => {
    void window.lumen.getSettings().then((next) => {
      setSettings(next);
      setGap(String(next.clickerIntervalMs));
    });
    void window.lumen.clickerState().then(setState);
    const stopTheme = window.lumen.onTheme(setSettings);
    const stopState = window.lumen.onClickerState(setState);
    return () => {
      stopTheme();
      stopState();
    };
  }, []);

  useEffect(() => {
    if (!listen) return;
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      setListen(false);
      if (event.key === "Escape") {
        void window.lumen.setSettings({
          clickerToggleVk: 0,
          clickerToggleName: "",
        }).then(setSettings);
        return;
      }
      const vk = event.keyCode;
      if (!vk) return;
      void window.lumen.setSettings({
        clickerToggleVk: vk,
        clickerToggleName: keyName(event).slice(0, 24),
      }).then(setSettings);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listen]);

  const enabled = settings?.clickerEnabled === true;
  const button = settings?.clickerButton ?? "left";
  const status = !enabled ? "Off" : state.holding ? "Clicking" : state.running ? "Armed" : "Stopped";

  return (
    <div className="perf-app">
      <header className="macro-bar">
        <span className="hub-kicker">Autoclicker</span>
        <strong>Clicks</strong>
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
        <WindowControls
          onMinimize={() => { void window.lumen.clickerWindow("minimize"); }}
          onMaximize={() => { void window.lumen.clickerWindow("maximize"); }}
          onClose={() => { void window.lumen.clickerWindow("close"); }}
        />
      </header>
      <div className="clicker-body">
        <button
          type="button"
          className={state.running ? "clicker-run is-on" : "clicker-run"}
          disabled={!enabled}
          onClick={() => { void window.lumen.toggleClicker().then(setState); }}
        >
          {state.running ? "Stop" : "Start"}
          <small>{status}</small>
        </button>
        <div className="clicker-choices" role="group" aria-label="Mouse button">
          {BUTTONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={button === item.id ? "is-on" : ""}
              onClick={() => {
                void window.lumen.setSettings({ clickerButton: item.id }).then(setSettings);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="clicker-gap">
          <span>Every</span>
          <input
            value={gap}
            inputMode="numeric"
            aria-label="Milliseconds between clicks"
            onChange={(event) => {
              setGap(event.target.value.replace(/[^\d]/g, "").slice(0, 4));
            }}
            onBlur={() => {
              const ms = clickerInterval(Number(gap));
              setGap(String(ms));
              void window.lumen.setSettings({ clickerIntervalMs: ms }).then(setSettings);
            }}
          />
          <em>ms</em>
        </label>
        <button
          type="button"
          className={listen ? "clicker-key is-on" : "clicker-key"}
          onClick={() => setListen(true)}
        >
          <span>Toggle key</span>
          <strong>
            {listen ? "Press a key" : settings?.clickerToggleName || "None"}
          </strong>
        </button>
        <p className="hub-note">
          Start it here, then leave this window. Clicks go to whatever is in
          front. The toggle key does the same from a game. Escape clears the key.
          {settings ? ` ${Math.round(1000 / settings.clickerIntervalMs)} clicks a second.` : ""}
        </p>
      </div>
    </div>
  );
}
