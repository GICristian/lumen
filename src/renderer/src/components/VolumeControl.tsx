import { useEffect, useRef, useState, type CSSProperties } from "react";

/** One volume interaction shared by the player, studio and desktop preview. */
export function VolumeControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const previous = useRef(value > 0 ? value : 1);
  const last = useRef(value);
  const [feedback, setFeedback] = useState(false);
  useEffect(() => {
    if (last.current === value) return;
    last.current = value; setFeedback(true);
    const timer = window.setTimeout(() => setFeedback(false), 1200);
    return () => window.clearTimeout(timer);
  }, [value]);
  useEffect(() => { if (value > 0) previous.current = value; }, [value]);
  const muted = value === 0;
  return (
    <div className={`volume-control${muted ? " is-muted" : ""}`} style={{ "--volume": `${value * 100}%` } as CSSProperties}>
      {feedback ? <span className="volume-feedback" role="status">{muted ? "Muted" : `Volume ${Math.round(value * 100)}%`}<i /></span> : null}
      <button type="button" className="icon-btn volume-toggle" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted}
        data-tooltip={muted ? "Restore volume" : "Mute"} onClick={() => onChange(muted ? previous.current : 0)}>
        <svg className="ico volume-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10h3l4-4v12l-4-4H4z" />
          <path className="volume-wave near" d="M14 9a5 5 0 0 1 0 6" />
          <path className={`volume-wave far${value < .5 ? " is-quiet" : ""}`} d="M17 6a9 9 0 0 1 0 12" />
          <path className="volume-slash" d="m15 9 6 6m0-6-6 6" />
        </svg>
      </button>
      <input type="range" min={0} max={1} step={.01} value={value} aria-label="Volume" aria-valuetext={`${Math.round(value * 100)} percent`}
        onChange={(event) => onChange(Number(event.target.value))} />
      <output className="volume-value">{Math.round(value * 100)}<span>%</span></output>
    </div>
  );
}
