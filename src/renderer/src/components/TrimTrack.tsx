import { useRef } from "react";
import { dragEnd, dragStart } from "@shared/range";

type Drag = "start" | "end" | "move" | "seek";

type Props = {
  duration: number;
  time: number;
  trim: boolean;
  start: number;
  end: number;
  onSeek: (time: number) => void;
  onRange: (start: number, end: number) => void;
  onScrub?: (active: boolean) => void;
};

function place(clientX: number, track: HTMLDivElement, duration: number): number {
  const rect = track.getBoundingClientRect();
  if (rect.width <= 0 || duration <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return ratio * duration;
}

export function TrimTrack({
  duration,
  time,
  trim,
  start,
  end,
  onSeek,
  onRange,
  onScrub,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const playRatio = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
  const startRatio = duration > 0 ? start / duration : 0;
  const endRatio = duration > 0 ? end / duration : 1;

  function drag(kind: Drag, event: React.PointerEvent<HTMLElement>): void {
    const track = trackRef.current;
    if (!track || duration <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const originStart = start;
    const originEnd = end;
    const span = Math.max(0.1, originEnd - originStart);
    let moved = false;
    onScrub?.(true);
    if (kind === "seek") onSeek(place(event.clientX, track, duration));

    const move = (ev: PointerEvent): void => {
      if (Math.abs(ev.clientX - originX) > 2) moved = true;
      const at = place(ev.clientX, track, duration);
      if (kind === "seek") {
        onSeek(at);
        return;
      }
      if (kind === "start") {
        const next = dragStart(at, originEnd, duration);
        onRange(next.a, next.b);
        onSeek(next.a);
        return;
      }
      if (kind === "end") {
        const next = dragEnd(originStart, at, duration);
        onRange(next.a, next.b);
        onSeek(next.b);
        return;
      }
      const delta = ((ev.clientX - originX) / track.getBoundingClientRect().width) * duration;
      let nextStart = originStart + delta;
      nextStart = Math.max(0, Math.min(duration - span, nextStart));
      onRange(nextStart, nextStart + span);
    };
    const up = (ev: PointerEvent): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onScrub?.(false);
      if (!moved && kind === "move") onSeek(place(ev.clientX, track, duration));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  if (!trim) {
    return (
      <input
        className="length-slider"
        type="range"
        min={0}
        max={duration || 0}
        step={0.05}
        value={Math.min(time, duration || 0)}
        disabled={duration <= 0}
        aria-label="Clip position"
        onChange={(event) => onSeek(Number(event.target.value))}
      />
    );
  }

  return (
    <div
      className="trim-track"
      ref={trackRef}
      onPointerDown={(event) => drag("seek", event)}
    >
      <div className="trim-rail" />
      <div
        className="trim-segment"
        style={{ left: `${startRatio * 100}%`, width: `${(endRatio - startRatio) * 100}%` }}
        onPointerDown={(event) => drag("move", event)}
      />
      <button
        type="button"
        className="trim-handle is-start"
        style={{ left: `${startRatio * 100}%` }}
        aria-label="Trim start"
        onPointerDown={(event) => drag("start", event)}
      />
      <button
        type="button"
        className="trim-handle is-end"
        style={{ left: `${endRatio * 100}%` }}
        aria-label="Trim end"
        onPointerDown={(event) => drag("end", event)}
      />
      <div className="trim-playhead" style={{ left: `${playRatio * 100}%` }} />
    </div>
  );
}
