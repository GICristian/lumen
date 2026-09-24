import { useRef, useState } from "react";
import type { Marks } from "@shared/range";
import { formatClock } from "../player/usePlayback";

type Props = {
  duration: number;
  current: number;
  marks: Marks;
  onSeek: (time: number) => void;
  onScrubbing: (active: boolean) => void;
  onMark: (which: "a" | "b", time: number) => void;
};

export function Timeline({ duration, current, marks, onSeek, onScrubbing, onMark }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const safeDuration = duration > 0 ? duration : 0;

  function timeFor(clientX: number): number {
    const bar = barRef.current;
    if (!bar || safeDuration <= 0) return 0;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * safeDuration;
  }

  function percent(time: number): string {
    if (safeDuration <= 0) return "0%";
    return `${(time / safeDuration) * 100}%`;
  }

  function dragSeek(event: React.PointerEvent<HTMLDivElement>): void {
    if ((event.target as HTMLElement).dataset.handle) return;
    onScrubbing(true);
    onSeek(timeFor(event.clientX));
    const bar = event.currentTarget;
    bar.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent): void => onSeek(timeFor(ev.clientX));
    const up = (): void => {
      onScrubbing(false);
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  }

  function dragHandle(which: "a" | "b", event: React.PointerEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent): void => onMark(which, timeFor(ev.clientX));
    const up = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  }

  const region =
    marks.a !== null && marks.b !== null
      ? { left: percent(marks.a), width: percent(marks.b - marks.a) }
      : null;

  return (
    <div
      className="timeline"
      ref={barRef}
      onPointerDown={dragSeek}
      onPointerMove={(event) => setHover(timeFor(event.clientX))}
      onPointerLeave={() => setHover(null)}
    >
      <div className="timeline-track" />
      {region ? <div className="timeline-region" style={region} /> : null}
      <div className="timeline-play" style={{ left: percent(current) }} />
      {marks.a !== null ? (
        <button
          type="button"
          className="mark mark-a"
          data-handle="a"
          style={{ left: percent(marks.a) }}
          onPointerDown={(event) => dragHandle("a", event)}
          aria-label="Mark A"
        />
      ) : null}
      {marks.b !== null ? (
        <button
          type="button"
          className="mark mark-b"
          data-handle="b"
          style={{ left: percent(marks.b) }}
          onPointerDown={(event) => dragHandle("b", event)}
          aria-label="Mark B"
        />
      ) : null}
      {hover !== null ? (
        <div className="timeline-tip" style={{ left: percent(hover) }}>
          {formatClock(hover)}
        </div>
      ) : null}
    </div>
  );
}
