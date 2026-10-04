import { useEffect, useState } from "react";
import type { SubtitleHit } from "@shared/contracts";
import type { CueStyle } from "@shared/cues";

type Props = {
  fileLabel: string;
  loop: boolean;
  onToggleLoop: () => void;
  overlayShortcut: string;
  onDefaultApps: () => void;
  language: string;
  onLanguage: (language: string) => void;
  loadedLabel: string | null;
  onSubtitles: (vtt: string, label: string) => void;
  onClearSubs: () => void;
  delay: number;
  onDelay: (seconds: number) => void;
  onSync: () => void;
  syncing: boolean;
  canSync: boolean;
  cueStyle: CueStyle;
  onStyle: (next: CueStyle) => void;
  rate: number;
  onRate: (rate: number) => void;
};

type Page = "root" | "playback" | "subtitles" | "app";

const colors = [
  { id: "white", value: "#ffffff" },
  { id: "yellow", value: "#ffe56a" },
  { id: "cyan", value: "#5ce1ff" },
  { id: "soft", value: "#d7dde8" },
];

const titles: Record<Page, string> = {
  root: "Settings",
  playback: "Playback",
  subtitles: "Subtitles",
  app: "App",
};

function formatDelay(seconds: number): string {
  const sign = seconds > 0 ? "+" : "";
  return `${sign}${seconds.toFixed(1)}s`;
}

function clampDelay(seconds: number): number {
  return Math.max(-20, Math.min(20, Math.round(seconds * 10) / 10));
}

export function PlayerSettings(props: Props) {
  const [page, setPage] = useState<Page>("root");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SubtitleHit[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stem = props.fileLabel.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").trim();
    if (!stem || stem === "No video") return;
    setQuery(stem);
    setHits([]);
    setStatus(null);
  }, [props.fileLabel]);

  async function search(): Promise<void> {
    setBusy(true);
    setStatus("Searching…");
    try {
      const found = await window.lumen.searchSubtitles(query, props.language);
      setHits(found);
      setStatus(found.length === 0 ? "No subtitles for that search" : `${found.length} found`);
    } catch (error) {
      setHits([]);
      setStatus(error instanceof Error ? error.message : "Subtitle search failed");
    } finally {
      setBusy(false);
    }
  }

  async function pick(hit: SubtitleHit): Promise<void> {
    setBusy(true);
    setStatus(`Downloading ${hit.title}…`);
    try {
      const vtt = await window.lumen.fetchSubtitle(hit.url);
      props.onSubtitles(vtt, hit.title);
      setStatus(`Loaded · ${hit.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Subtitle download failed");
    } finally {
      setBusy(false);
    }
  }

  async function openFile(): Promise<void> {
    setStatus(null);
    try {
      const vtt = await window.lumen.openSubtitleFile();
      if (!vtt) return;
      props.onSubtitles(vtt, "Subtitle file");
      setStatus("Loaded · Subtitle file");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Subtitle file failed");
    }
  }

  const subHint = props.loadedLabel ?? "None";
  const playHint = [props.loop ? "Loop" : null]
    .filter(Boolean)
    .join(", ") || "Off";

  return (
    <div className="settings-pop" id="player-settings" role="region" aria-label="Playback settings">
      <div className="menu-head">
        {page === "root" ? (
          <span className="menu-title">{titles[page]}</span>
        ) : (
          <button type="button" className="menu-back" onClick={() => setPage("root")}>
            <span aria-hidden="true">‹</span>
            {titles[page]}
          </button>
        )}
      </div>

      {page === "root" ? (
        <div className="menu-list">
          <button type="button" className="menu-row" onClick={() => setPage("playback")}>
            <span>Playback</span>
            <em>{playHint}</em>
          </button>
          <button type="button" className="menu-row" onClick={() => setPage("subtitles")}>
            <span>Subtitles</span>
            <em>{subHint}</em>
          </button>
          <button type="button" className="menu-row" onClick={() => setPage("app")}>
            <span>App</span>
            <em>›</em>
          </button>
        </div>
      ) : null}

      {page === "playback" ? (
        <div className="menu-list">
          <button type="button" className="menu-row" aria-pressed={props.loop} onClick={props.onToggleLoop}>
            <span>Loop</span>
            <i className={props.loop ? "switch is-on" : "switch"} />
          </button>
          <div className="speed-row" role="group" aria-label="Playback speed">
            {[0.5, 1, 1.25, 1.5, 2].map((value) => (
              <button
                key={value}
                type="button"
                className={props.rate === value ? "chip is-on" : "chip"}
                aria-pressed={props.rate === value}
                onClick={() => props.onRate(value)}
              >
                {value}x
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {page === "subtitles" ? (
        <div className="menu-list">
          <p className={props.loadedLabel ? "sub-loaded" : "sub-loaded is-empty"}>
            {props.loadedLabel ? `Loaded · ${props.loadedLabel}` : "No subtitles loaded"}
          </p>
          <div className="menu-search">
            <input
              value={query}
              placeholder="Movie or episode"
              aria-label="Subtitle search"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search();
              }}
            />
            <div className="chips" role="radiogroup" aria-label="Subtitle language">
              <button
                type="button"
                className={props.language === "rum" ? "chip is-on" : "chip"}
                onClick={() => props.onLanguage("rum")}
              >
                RO
              </button>
              <button
                type="button"
                className={props.language === "eng" ? "chip is-on" : "chip"}
                onClick={() => props.onLanguage("eng")}
              >
                EN
              </button>
            </div>
          </div>
          <button
            type="button"
            className="menu-go"
            disabled={busy}
            onClick={() => void search()}
          >
            {busy ? "Working…" : "Search"}
          </button>
          {status ? <p className="menu-note">{status}</p> : null}
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              className="menu-row is-stack"
              onClick={() => void pick(hit)}
              title={hit.fileName}
            >
              <strong>{hit.title}</strong>
              <small>
                {hit.fileName} · {hit.downloads}
              </small>
            </button>
          ))}
          <button type="button" className="menu-row" onClick={() => void openFile()}>
            <span>Open subtitle file</span>
          </button>
          <button
            type="button"
            className="menu-row"
            onClick={props.onClearSubs}
            disabled={!props.loadedLabel}
          >
            <span>Turn subtitles off</span>
          </button>
          <div className="menu-row is-static">
            <span>Delay</span>
            <div className="stepper">
              <button
                type="button"
                onClick={() => props.onDelay(clampDelay(props.delay - 0.1))}
              >
                −
              </button>
              <strong>{formatDelay(props.delay)}</strong>
              <button
                type="button"
                onClick={() => props.onDelay(clampDelay(props.delay + 0.1))}
              >
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            className="menu-row"
            disabled={!props.canSync || props.syncing}
            onClick={props.onSync}
          >
            <span>{props.syncing ? "Listening to the audio…" : "Autosync by audio"}</span>
          </button>
          <p className="menu-note">Customize</p>
          <label className="menu-row is-static">
            <span>Size</span>
            <input
              type="range"
              min={16}
              max={40}
              step={1}
              value={props.cueStyle.size}
              aria-label="Subtitle size"
              onChange={(event) =>
                props.onStyle({ ...props.cueStyle, size: Number(event.target.value) })
              }
            />
            <em>{props.cueStyle.size}</em>
          </label>
          <div className="menu-row is-static">
            <span>Color</span>
            <div className="swatches" role="radiogroup" aria-label="Subtitle color">
              {colors.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  className={props.cueStyle.color === color.value ? "swatch is-on" : "swatch"}
                  style={{ background: color.value }}
                  aria-label={color.id}
                  onClick={() => props.onStyle({ ...props.cueStyle, color: color.value })}
                />
              ))}
            </div>
          </div>
          <label className="menu-row is-static">
            <span>Outline</span>
            <input
              type="range"
              min={0}
              max={4}
              step={1}
              value={props.cueStyle.outline}
              aria-label="Subtitle outline"
              onChange={(event) =>
                props.onStyle({ ...props.cueStyle, outline: Number(event.target.value) })
              }
            />
            <em>{props.cueStyle.outline}</em>
          </label>
          <label className="menu-row is-static">
            <span>Background</span>
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.05}
              value={props.cueStyle.backdrop}
              aria-label="Subtitle background"
              onChange={(event) =>
                props.onStyle({ ...props.cueStyle, backdrop: Number(event.target.value) })
              }
            />
          </label>
          <label className="menu-row is-static">
            <span>Height</span>
            <input
              type="range"
              min={0}
              max={28}
              step={1}
              value={props.cueStyle.lift}
              aria-label="Subtitle height"
              onChange={(event) =>
                props.onStyle({ ...props.cueStyle, lift: Number(event.target.value) })
              }
            />
          </label>
        </div>
      ) : null}

      {page === "app" ? (
        <div className="menu-list">
          <button type="button" className="menu-row" onClick={props.onDefaultApps}>
            <span>Set as default player</span>
          </button>
          <p className="menu-note">Overlay shortcut: {props.overlayShortcut}.</p>
        </div>
      ) : null}
    </div>
  );
}
