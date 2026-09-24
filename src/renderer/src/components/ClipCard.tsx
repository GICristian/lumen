import { useEffect, useRef, useState, type RefObject } from "react";
import type { FolderItem } from "@shared/contracts";
import { clipTitle, formatBytes, formatWhen } from "@shared/clips";
import { posterImage } from "../player/usePosters";
import { formatClock, mediaUrl } from "../player/usePlayback";

type CardProps = {
  item: FolderItem;
  poster: string | undefined;
  hot: boolean;
  onVisible: (path: string) => void;
  onHover: (path: string | null) => void;
  onOpen: (path: string) => void;
};

function useSeen<T extends HTMLElement>(
  onVisible: (path: string) => void,
  path: string,
): { ref: RefObject<T | null>; seen: boolean } {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        setSeen(visible);
        if (visible) onVisible(path);
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible, path]);
  return { ref, seen };
}

function StillFrame({
  path,
  live,
  onReady,
}: {
  path: string;
  live: boolean;
  onReady: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || live) return;
    video.pause();
  }, [live]);

  return (
    <video
      ref={videoRef}
      src={mediaUrl(path)}
      muted
      playsInline
      preload="auto"
      onLoadedData={(event) => {
        const media = event.currentTarget;
        const duration = media.duration;
        const ratio = Number.isFinite(duration) ? duration * 0.12 : 0.4;
        const target = Math.min(1, Math.max(0.1, ratio));
        if (media.currentTime < 0.05) media.currentTime = target;
        onReady();
      }}
    />
  );
}

function Poster({
  poster,
  path,
  seen,
}: {
  poster: string | undefined;
  path: string;
  seen: boolean;
}) {
  const image = posterImage(poster);
  const [ready, setReady] = useState(false);
  if (image) return <img src={image} alt="" />;
  if (!seen && !ready) return <span className="clip-fallback is-wait" />;
  return <StillFrame path={path} live={seen} onReady={() => setReady(true)} />;
}

function HoverVideo({ path }: { path: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 160);
    return () => window.clearTimeout(timer);
  }, [path]);

  if (!ready) return null;
  return (
    <>
      <video
        ref={videoRef}
        src={mediaUrl(path)}
        muted
        autoPlay
        loop
        playsInline
        onLoadedMetadata={(event) => {
          const media = event.currentTarget;
          if (Number.isFinite(media.duration)) setDuration(media.duration);
        }}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
      />
      {duration > 0 ? (
        <label className="clip-seek" onClick={(event) => event.stopPropagation()}>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={Math.min(time, duration)}
            aria-label="Preview position"
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => {
              const next = Number(event.target.value);
              const video = videoRef.current;
              if (video) video.currentTime = next;
              setTime(next);
            }}
          />
          <span>{formatClock(time)}</span>
        </label>
      ) : null}
    </>
  );
}

export function ClipCard({ item, poster, hot, onVisible, onHover, onOpen }: CardProps) {
  const { ref, seen } = useSeen<HTMLElement>(onVisible, item.path);

  return (
    <article
      ref={ref}
      className={hot ? "clip-card is-hot" : "clip-card"}
      onMouseEnter={() => onHover(item.path)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onOpen(item.path)}
    >
      <div className="clip-frame">
        <span className="clip-ratio" />
        <Poster poster={poster} path={item.path} seen={seen} />
        {hot ? <HoverVideo path={item.path} /> : null}
      </div>
      <div className="clip-caption">
        <span className="clip-name" title={item.name}>
          {clipTitle(item.name)}
        </span>
        <span className="clip-sub">
          {formatBytes(item.sizeBytes)} · {formatWhen(item.mtimeMs)}
        </span>
      </div>
    </article>
  );
}

type SideProps = {
  item: FolderItem;
  poster: string | undefined;
  active: boolean;
  onVisible: (path: string) => void;
  onOpen: (path: string) => void;
};

export function SideClip({ item, poster, active, onVisible, onOpen }: SideProps) {
  const { ref, seen } = useSeen<HTMLButtonElement>(onVisible, item.path);
  const [hot, setHot] = useState(false);

  return (
    <button
      ref={ref}
      type="button"
      className={active ? "side-clip is-on" : "side-clip"}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onClick={() => onOpen(item.path)}
    >
      <span className="side-thumb">
        <Poster poster={poster} path={item.path} seen={seen || active} />
        {hot ? <HoverVideo path={item.path} /> : null}
      </span>
      <span className="side-name" title={item.name}>
        {clipTitle(item.name)}
      </span>
    </button>
  );
}
