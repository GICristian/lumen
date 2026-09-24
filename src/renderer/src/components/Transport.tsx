import { formatClock } from "../player/usePlayback";

type Props = {
  playing: boolean;
  current: number;
  duration: number;
  volume: number;
  loop: boolean;
  precise: boolean;
  cropMode: boolean;
  canExport: boolean;
  exportHint: string | null;
  fastTrim: boolean;
  progress: number | null;
  onTogglePlay: () => void;
  onVolume: (volume: number) => void;
  onToggleLoop: () => void;
  onMarkIn: () => void;
  onMarkOut: () => void;
  canClear: boolean;
  segmentLoop: boolean;
  onClearSegment: () => void;
  onTogglePrecise: () => void;
  onToggleCrop: () => void;
  onExport: () => void;
  onCancel: () => void;
};

export function Transport(props: Props) {
  const preciseOn = props.cropMode || props.precise;
  return (
    <footer className="transport">
      <button type="button" className="play-btn" onClick={props.onTogglePlay} aria-label="Play">
        {props.playing ? "Pause" : "Play"}
      </button>
      <span className="clock">
        {formatClock(props.current)} / {formatClock(props.duration)}
      </span>
      <label className="volume">
        <span>Vol</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={props.volume}
          onChange={(event) => props.onVolume(Number(event.target.value))}
        />
      </label>
      <button
        type="button"
        className={props.loop ? "text-btn is-on" : "text-btn"}
        onClick={props.onToggleLoop}
      >
        Loop
      </button>
      <button type="button" className="text-btn" onClick={props.onMarkIn}>
        In
      </button>
      <button type="button" className="text-btn" onClick={props.onMarkOut}>
        Out
      </button>
      <button
        type="button"
        className="text-btn"
        onClick={props.onClearSegment}
        disabled={!props.canClear}
      >
        Clear
      </button>
      <button
        type="button"
        className={preciseOn ? "text-btn is-on" : "text-btn"}
        onClick={props.onTogglePrecise}
        disabled={props.cropMode}
        aria-pressed={preciseOn}
      >
        Precise
      </button>
      <button
        type="button"
        className={props.cropMode ? "text-btn is-on" : "text-btn"}
        onClick={props.onToggleCrop}
      >
        Crop
      </button>
      {props.progress !== null ? (
        <>
          <span className="progress">{Math.round(props.progress * 100)}%</span>
          <button type="button" className="text-btn" onClick={props.onCancel}>
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          className="export-btn"
          onClick={props.onExport}
          disabled={!props.canExport}
        >
          Export
        </button>
      )}
      <div className="transport-note">
        {props.segmentLoop ? <span>A–B loop is on until you clear it.</span> : null}
        {props.exportHint ? <span>{props.exportHint}</span> : null}
        {props.fastTrim ? <span>Fast trim cuts on the nearest keyframe.</span> : null}
      </div>
    </footer>
  );
}
