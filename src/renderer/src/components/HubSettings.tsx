import { useEffect, useState } from "react";
import { acceleratorFromEvent } from "@shared/shortcut";

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

type Bind = "overlay" | "vault";

type Props = {
  overlayShortcut: string;
  vaultShortcut: string;
  launchOnStartup: boolean;
  cursorSize: number;
  onCursorSize: (size: number) => void;
  exportDirectory: string | null;
  onExportDirectory: () => void;
  onShortcut: (which: Bind, accelerator: string) => Promise<void>;
  onLaunch: (enabled: boolean) => Promise<void>;
};

export function HubSettings({
  overlayShortcut,
  vaultShortcut,
  launchOnStartup,
  cursorSize,
  onCursorSize,
  exportDirectory,
  onExportDirectory,
  onShortcut,
  onLaunch,
}: Props) {
  const [bind, setBind] = useState<Bind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!bind) return;
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
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

  return (
    <div className="hub-panel">
      <section className="hub-sheet">
        <span className="hub-kicker">Keybinds</span>
        <h2>Shortcuts</h2>
        <p className="hub-note">
          Each one needs Ctrl, Alt, or Shift. Leave Alt+Z free for the graphics overlay.
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
        {notice ? <p className="hub-note is-warn">{notice}</p> : null}
      </section>
      <section className="hub-sheet">
        <span className="hub-kicker">Appearance</span>
        <h2>Cursor</h2>
        <p className="hub-note">A soft Lumen pointer across the hub, player and overlay.</p>
        <label className="cursor-setting">
          <span>Size</span>
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
      <section className="hub-sheet">
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
      <section className="hub-sheet">
        <span className="hub-kicker">Export</span>
        <h2>Save destination</h2>
        <button type="button" className="bind-row" onClick={onExportDirectory}>
          <span className="export-location">{exportDirectory ?? "Choose a default folder"}</span>
          <strong>Change</strong>
        </button>
        <p className="hub-note">Lumen remembers this folder for every video export.</p>
      </section>
      <section className="hub-sheet">
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
  );
}
