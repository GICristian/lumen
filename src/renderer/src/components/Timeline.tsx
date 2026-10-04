import { useEffect, useRef, useState } from "react";
import type { Marks } from "@shared/range";
import { snapTimelineTime } from "@shared/timeline";
import { formatClock, mediaUrl } from "../player/usePlayback";

type Props = {
  duration: number;
  current: number;
  marks: Marks;
  previewPath: string | null;
  onSeek: (time: number) => void;
  onScrubbing: (active: boolean) => void;
  onMark: (which: "a" | "b", time: number) => void;
};

export function Timeline({
  duration,
  current,
  marks,
  previewPath,
  onSeek,
  onScrubbing,
  onMark,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fine, setFine] = useState(false);
  const cleanupDrag = useRef<(() => void) | null>(null);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const anchors = [0, safeDuration, marks.a, marks.b].filter((time): time is number => time !== null);
  useEffect(() => () => cleanupDrag.current?.(), []);

  function timeFor(clientX: number): number {
    const bar = barRef.current;
    if (!bar || safeDuration <= 0) return 0;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    return snapTimelineTime(ratio * safeDuration, safeDuration, rect.width, anchors);
  }

  function percent(time: number): string {
    if (safeDuration <= 0) return "0%";
    return `${Math.max(0, Math.min(1, time / safeDuration)) * 100}%`;
  }

  function popupLeft(time: number): string {
    return `clamp(92px, ${percent(time)}, calc(100% - 92px))`;
  }

  useEffect(() => {
    const video = previewRef.current;
    if (!video || hover === null || !previewPath) return;
    const ticket = window.setTimeout(() => {
      if (video.readyState >= 1 && Math.abs(video.currentTime - hover) > 0.05) video.currentTime = hover;
    }, 90);
    return () => window.clearTimeout(ticket);
  }, [hover, previewPath]);

  function dragSeek(event: React.PointerEvent<HTMLDivElement>): void {
    if ((event.target as HTMLElement).dataset.handle || safeDuration <= 0 || event.button !== 0) return;
    event.preventDefault();
    cleanupDrag.current?.();
    event.currentTarget.focus();
    onScrubbing(true);
    setDragging(true);
    setFine(event.shiftKey);
    let lastX = event.clientX;
    let at = event.shiftKey ? current : timeFor(lastX);
    onSeek(at);
    setHover(at);
    const bar = event.currentTarget;
    const width = Math.max(1, bar.getBoundingClientRect().width);
    bar.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent): void => {
      at = ev.shiftKey ? Math.max(0, Math.min(safeDuration, at + (ev.clientX - lastX) / width * safeDuration * .1)) : timeFor(ev.clientX);
      lastX = ev.clientX;
      setFine(ev.shiftKey);
      setHover(at);
      onSeek(at);
    };
    const up = (): void => {
      onScrubbing(false);
      setDragging(false);
      setFine(false);
      setHover(null);
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
      bar.removeEventListener("lostpointercapture", up);
      cleanupDrag.current = null;
    };
    cleanupDrag.current = up;
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
    bar.addEventListener("lostpointercapture", up);
  }

  function dragHandle(which: "a" | "b", event: React.PointerEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    cleanupDrag.current?.();
    onScrubbing(true);
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent): void => onMark(which, timeFor(ev.clientX));
    const up = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      handle.removeEventListener("lostpointercapture", up);
      onScrubbing(false);
      cleanupDrag.current = null;
    };
    cleanupDrag.current = up;
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
    handle.addEventListener("lostpointercapture", up);
  }

  const region =
    marks.a !== null && marks.b !== null
      ? { left: percent(marks.a), width: percent(marks.b - marks.a) }
      : null;

  return (
    <div
      className={`timeline${dragging ? " is-scrubbing" : ""}`}
      ref={barRef}
      role="slider"
      tabIndex={safeDuration > 0 ? 0 : -1}
      aria-label="Video position"
      aria-valuemin={0}
      aria-valuemax={safeDuration}
      aria-valuenow={Math.min(safeDuration, Math.max(0, current))}
      aria-valuetext={`${formatClock(current)} of ${formatClock(safeDuration)}`}
      aria-disabled={safeDuration <= 0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || safeDuration <= 0) return;
        const step = event.shiftKey ? .1 : 1;
        const next = event.key === "ArrowRight" ? current + step : event.key === "ArrowLeft" ? current - step : event.key === "Home" ? 0 : event.key === "End" ? safeDuration : null;
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        onSeek(Math.max(0, Math.min(safeDuration, next)));
      }}
      onPointerDown={dragSeek}
      onPointerMove={(event) => { if (!dragging && safeDuration > 0) setHover(timeFor(event.clientX)); }}
      onPointerLeave={() => { if (!dragging) setHover(null); }}
    >
      <div className="timeline-track" />
      <div className="timeline-fill" style={{ width: percent(current) }} />
      {region ? <div className="timeline-region" style={region} /> : null}
      <div className="timeline-play" style={{ left: percent(current) }} />
      {hover !== null ? <div className="timeline-hover" style={{ left: percent(hover) }} /> : null}
      {marks.a !== null ? (
        <button
          type="button"
          className="mark mark-a"
          data-handle="a"
          style={{ left: percent(marks.a) }}
          onPointerDown={(event) => dragHandle("a", event)}
          aria-label="Mark A"
          onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); onMark("a", Math.max(0, Math.min(safeDuration, marks.a! + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? .1 : 1)))); } }}
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
          onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); onMark("b", Math.max(0, Math.min(safeDuration, marks.b! + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? .1 : 1)))); } }}
        />
      ) : null}
      {hover !== null ? (
        <div className="seek-pop" aria-hidden="true" style={{ left: popupLeft(hover) }}>
          {previewPath ? (
            <video
              ref={previewRef}
              src={mediaUrl(previewPath)}
              muted
              preload="metadata"
              playsInline
              onLoadedMetadata={(event) => { if (hover !== null) event.currentTarget.currentTime = hover; }}
            />
          ) : null}
          <span>{formatClock(hover)}<small>{fine ? `.${Math.floor((hover % 1) * 10)}` : ""}</small></span>
          <div className="seek-hint">{fine ? "FINE ADJUSTMENT" : "SHIFT · FINE SCRUB"}</div>
        </div>
      ) : null}
    </div>
  );
}
