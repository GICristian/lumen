import { useEffect, useRef } from "react";
import { formatClock, mediaUrl } from "../player/usePlayback";

type Props = {
  path: string;
  time: number;
  left: string;
};

/** A still of the clip, parked above the time under the pointer. */
export function SeekHover({ path, time, left }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const ticket = window.setTimeout(() => {
      if (video.readyState >= 1 && Math.abs(video.currentTime - time) > 0.08) {
        video.currentTime = time;
      }
    }, 70);
    return () => window.clearTimeout(ticket);
  }, [time]);
  return (
    <div className="seek-pop seek-hover" style={{ left }} aria-hidden="true">
      <video
        ref={ref}
        src={mediaUrl(path)}
        muted
        preload="auto"
        playsInline
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = time;
        }}
      />
      <span>{formatClock(time)}</span>
    </div>
  );
}

export function seekLeft(time: number, duration: number): string {
  const ratio = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
  return `clamp(90px, ${ratio * 100}%, calc(100% - 90px))`;
}
