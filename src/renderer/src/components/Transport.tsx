import { useEffect, useRef, useState } from "react";
import type { CueStyle } from "@shared/cues";
import { formatClock } from "../player/usePlayback";
import { Icon } from "./Icon";
import { PlayerSettings } from "./PlayerSettings";
import { VolumeControl } from "./VolumeControl";
import { PlaybackGlyph } from "./PlaybackGlyph";

type Props = {
  playing: boolean;
  current: number;
  duration: number;
  volume: number;
  canExport: boolean;
  exportHint: string | null;
  fastTrim: boolean;
  progress: number | null;
  segmentLoop: boolean;
  canClear: boolean;
  fileLabel: string;
  onShowInFolder?: () => void;
  loop: boolean;
  precise: boolean;
  cropMode: boolean;
  overlayShortcut: string;
  loadedLabel: string | null;
  language: string;
  onLanguage: (language: string) => void;
  delay: number;
  syncing: boolean;
  canSync: boolean;
  cueStyle: CueStyle;
  onTogglePlay: () => void;
  onVolume: (volume: number) => void;
  onExport: () => void;
  onCancel: () => void;
  onMarkIn: () => void;
  onMarkOut: () => void;
  onClearSegment: () => void;
  onToggleLoop: () => void;
  onTogglePrecise: () => void;
  onToggleCrop: () => void;
  onDefaultApps: () => void;
  onSubtitles: (vtt: string, label: string) => void;
  onClearSubs: () => void;
  onDelay: (seconds: number) => void;
  onSync: () => void;
  onStyle: (next: CueStyle) => void;
  onMenu: (open: boolean) => void;
  onFullscreen: () => void;
  rate: number;
  onRate: (rate: number) => void;
  editorMode: boolean;
  fullscreen: boolean;
  available: boolean;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
};

export function Transport(props: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    props.onMenu(open);
  }, [open, props.onMenu]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      settingsRef.current?.focus();
    };
    menuRef.current?.querySelector<HTMLButtonElement>(".settings-pop button")?.focus();
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <footer className="transport">
      <div className="transport-playback">
        <button type="button" className="icon-btn" aria-label="Previous clip" data-tooltip="Previous clip · Ctrl ←" disabled={!props.hasPrevious} onClick={props.onPrevious}><Icon name="previous" /></button>
        <button type="button" className="play-btn" onClick={props.onTogglePlay} disabled={!props.available} aria-label={props.playing ? "Pause" : "Play"} data-tooltip={props.playing ? "Pause · Space" : "Play · Space"}>
          <PlaybackGlyph playing={props.playing} />
        </button>
        <button type="button" className="icon-btn" aria-label="Next clip" data-tooltip="Next clip · Ctrl →" disabled={!props.hasNext} onClick={props.onNext}><Icon name="next" /></button>
      </div>
      <span className="clock">
        <strong>{formatClock(props.current)}</strong>
        <span className="clock-divider">/</span><span>{formatClock(props.duration)}</span>
      </span>
      <div className="transport-spacer" />
      {props.onShowInFolder ? <button type="button" className="icon-btn" aria-label="Show in folder" data-tooltip="Show in folder" onClick={props.onShowInFolder}><Icon name="folder" /></button> : null}
      <button type="button" className={`icon-btn loop-toggle${props.loop ? " is-on" : ""}`} aria-label="Loop video" aria-pressed={props.loop} data-tooltip="Loop video · L" onClick={props.onToggleLoop}><Icon name="loop" /></button>
      <VolumeControl value={props.volume} onChange={props.onVolume} />
      {props.editorMode ? <div className="trim-tools" title="Mark the in and out points. Keys I and O.">
        <button type="button" className="text-btn" onClick={props.onMarkIn}>In</button>
        <button type="button" className="text-btn" onClick={props.onMarkOut}>Out</button>
        <button
          type="button"
          className="text-btn"
          onClick={props.onClearSegment}
          disabled={!props.canClear}
        >
          Clear
        </button>
      </div> : null}
      <button
        type="button"
        className={`icon-btn fullscreen-toggle${props.fullscreen ? " is-on" : ""}`}
        aria-label={props.fullscreen ? "Exit fullscreen" : "Fullscreen"}
        data-tooltip={props.fullscreen ? "Exit fullscreen · Esc" : "Fullscreen · F"}
        aria-pressed={props.fullscreen}
        onClick={props.onFullscreen}
      >
        <Icon name="full" />
      </button>
      <div className="settings-anchor" ref={menuRef}>
        <button
          type="button"
          className={open ? "icon-btn is-on" : "icon-btn"}
          ref={settingsRef}
          aria-label="Settings"
          aria-expanded={open}
          data-tooltip={open ? undefined : "Playback settings"}
          aria-controls={open ? "player-settings" : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="gear" />
        </button>
        {open ? (
          <PlayerSettings
            fileLabel={props.fileLabel}
            loop={props.loop}
            onToggleLoop={props.onToggleLoop}
            overlayShortcut={props.overlayShortcut}
            onDefaultApps={props.onDefaultApps}
            loadedLabel={props.loadedLabel}
            language={props.language}
            onLanguage={props.onLanguage}
            onSubtitles={props.onSubtitles}
            onClearSubs={props.onClearSubs}
            delay={props.delay}
            onDelay={props.onDelay}
            onSync={props.onSync}
            syncing={props.syncing}
            canSync={props.canSync}
            cueStyle={props.cueStyle}
            onStyle={props.onStyle}
            rate={props.rate}
            onRate={props.onRate}
          />
        ) : null}
      </div>
      {props.editorMode && props.progress !== null ? (
        <>
          <span className="progress">{Math.round(props.progress * 100)}%</span>
          <button type="button" className="text-btn" onClick={props.onCancel}>
            Cancel
          </button>
        </>
      ) : null}
      {props.editorMode && props.progress === null && props.canExport ? (
        <button type="button" className="export-btn" onClick={props.onExport}>
          Export
        </button>
      ) : null}
      <div className="transport-note">
        {props.segmentLoop ? <span>A–B loop is on until you clear it.</span> : null}
        {props.editorMode && props.exportHint ? <span>{props.exportHint}</span> : null}
        {props.editorMode && props.fastTrim ? <span>Fast trim cuts on the nearest keyframe.</span> : null}
      </div>
    </footer>
  );
}
