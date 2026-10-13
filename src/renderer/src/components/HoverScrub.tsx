import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatClock, mediaUrl } from "../player/usePlayback";
import { usePreviewAudio } from "../player/previewAudio";

type Props = { path: string; children: ReactNode };

export function HoverScrub({ path, children }: Props) {
  const frame = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const seekAt = useRef(0);
  const ratioRef = useRef(0);
  const arm = useRef<number | null>(null);
  const [hot, setHot] = useState(false);
  const [ratio, setRatio] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audio, setAudio] = usePreviewAudio();

  useEffect(() => () => {
    if (arm.current !== null) window.clearTimeout(arm.current);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.muted = !audio;
    if (audio) void element.play().catch(() => undefined);
    else element.pause();
  }, [audio, hot]);

  function seek(next: number): void {
    ratioRef.current = next;
    setRatio(next);
    const element = video.current;
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0) return;
    const now = performance.now();
    if (now - seekAt.current < 70) return;
    seekAt.current = now;
    const time = next * element.duration;
    if (Math.abs(element.currentTime - time) > 0.05) element.currentTime = time;
  }

  return (
    <span
      className="scrub"
      ref={frame}
      onPointerEnter={() => {
        if (arm.current !== null) window.clearTimeout(arm.current);
        arm.current = window.setTimeout(() => setHot(true), 60);
      }}
      onPointerLeave={() => {
        if (arm.current !== null) window.clearTimeout(arm.current);
        setHot(false);
        setRatio(0);
        ratioRef.current = 0;
        setDuration(0);
      }}
      onPointerMove={(event) => {
        const rect = frame.current?.getBoundingClientRect();
        if (!rect || rect.width < 1) return;
        const next = (event.clientX - rect.left) / rect.width;
        seek(Math.min(0.985, Math.max(0, next)));
      }}
    >
      {children}
      {hot ? (
        <video
          ref={video}
          className="scrub-video"
          src={mediaUrl(path)}
          muted={!audio}
          playsInline
          preload="auto"
          onLoadedMetadata={(event) => {
            const element = event.currentTarget;
            setDuration(element.duration);
            const time = ratioRef.current * element.duration;
            if (Number.isFinite(time)) element.currentTime = time;
            if (audio) void element.play().catch(() => undefined);
          }}
        />
      ) : null}
      {hot ? (
        <>
          <span className="scrub-bar"><i style={{ width: `${ratio * 100}%` }} /></span>
          <span className="scrub-time">{formatClock(ratio * duration)}</span>
          <button
            type="button"
            className={audio ? "scrub-audio is-on" : "scrub-audio"}
            aria-pressed={audio}
            aria-label={audio ? "Mute clip preview" : "Hear clip preview"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setAudio(!audio);
            }}
          >
            {audio ? "Audio on" : "Audio off"}
          </button>
        </>
      ) : null}
    </span>
  );
}
