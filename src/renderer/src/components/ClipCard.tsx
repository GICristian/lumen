import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { FolderItem } from "@shared/contracts";
import { clipTitle, formatBytes, formatWhen } from "@shared/clips";
import { POSTER_FAIL, posterImage } from "../player/usePosters";
import { mediaUrl } from "../player/usePlayback";
import { Icon } from "./Icon";

type CardProps = {
  item: FolderItem;
  poster: string | undefined;
  hot: boolean;
  onVisible: (path: string) => void;
  onHover: (path: string | null) => void;
  onOpen: (path: string) => void;
  onEdit?: (path: string) => void;
  selected: boolean;
  onSelect: (path: string, extend: boolean) => void;
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

let stillQueue: Promise<void> = Promise.resolve();

function releaseMedia(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

function drawStill(video: HTMLVideoElement): string | null {
  if (video.videoWidth < 2) return null;
  const width = 480;
  const height = Math.max(2, Math.round(width * (video.videoHeight / video.videoWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);
  try {
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

function StillFrame({ path, onFrame }: { path: string; onFrame: (url: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let dropped = false;
    const take = stillQueue.then(() => new Promise<void>((resolve) => {
      if (dropped) {
        resolve();
        return;
      }
      let done = false;
      let timer = 0;
      const finish = (url: string | null): void => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        video.removeEventListener("loadeddata", onData);
        video.removeEventListener("seeked", onSeek);
        releaseMedia(video);
        if (url && !dropped) onFrame(url);
        resolve();
      };
      const onSeek = (): void => finish(drawStill(video));
      const onData = (): void => {
        const duration = video.duration;
        const ratio = Number.isFinite(duration) ? duration * 0.12 : 0.4;
        const target = Math.min(1, Math.max(0.1, ratio));
        if (video.currentTime < 0.05) video.currentTime = target;
        else onSeek();
      };
      video.addEventListener("loadeddata", onData);
      video.addEventListener("seeked", onSeek);
      video.addEventListener("error", () => finish(null), { once: true });
      timer = window.setTimeout(() => finish(null), 8000);
      video.src = mediaUrl(path);
    }));
    stillQueue = take.then(() => undefined, () => undefined);
    return () => {
      dropped = true;
      releaseMedia(video);
    };
  }, [onFrame, path]);

  return <video ref={videoRef} muted playsInline preload="metadata" />;
}

export function Poster({
  poster,
  path,
  seen,
}: {
  poster: string | undefined;
  path: string;
  seen: boolean;
}) {
  const image = posterImage(poster);
  const [frame, setFrame] = useState<string | null>(null);
  if (image) return <img src={image} alt="" />;
  if (frame) return <img src={frame} alt="" />;
  if (poster !== POSTER_FAIL || !seen) return <span className="clip-fallback is-wait" />;
  return <StillFrame path={path} onFrame={setFrame} />;
}

export function ClipCard({
  item,
  poster,
  hot,
  onVisible,
  onHover,
  onOpen,
  onEdit,
  selected,
  onSelect,
}: CardProps) {
  const { ref, seen } = useSeen<HTMLElement>(onVisible, item.path);
  const [revealError, setRevealError] = useState(false);

  return (
    <article
      ref={ref}
      tabIndex={0}
      aria-label={`Play ${item.name}`}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(item.path); } }}
      className={
        selected ? "clip-card is-selected" : hot ? "clip-card is-hot" : "clip-card"
      }
      onMouseEnter={() => onHover(item.path)}
      onMouseLeave={() => onHover(null)}
      onClick={(event) => {
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          onSelect(item.path, event.shiftKey);
          return;
        }
        onOpen(item.path);
      }}
    >
      <input
        type="checkbox"
        className="clip-check card-check"
        checked={selected}
        aria-label="Select clip"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(item.path, event.shiftKey);
        }}
        onChange={() => undefined}
      />
      <div className="clip-frame">
        <span className="clip-ratio" />
        <Poster poster={poster} path={item.path} seen={seen} />
        {onEdit ? (
          <button
            type="button"
            className="clip-edit"
            aria-label={`Edit ${item.name}`}
            title="Open editor"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(item.path);
            }}
          >
            <Icon name="edit" />
            <span>Edit</span>
          </button>
        ) : null}
      </div>
      <div className="clip-caption">
        <span className="clip-name" title={item.name}>
          {clipTitle(item.name)}
        </span>
        <span className="clip-sub">
          {formatBytes(item.sizeBytes)} · {formatWhen(item.mtimeMs)}
        </span>
        <button type="button" className="clip-reveal icon-btn" aria-label={`Show ${item.name} in folder`} title="Show in folder" onClick={(event) => { event.stopPropagation(); setRevealError(false); void window.lumen.showItem(item.path).catch(() => setRevealError(true)); }}><Icon name="folder" /></button>
        {revealError ? <small role="alert">Folder could not be opened.</small> : null}
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
  selected: boolean;
  onSelect: (path: string, extend: boolean) => void;
  thumbSize: number;
};

export function SideClip({
  item,
  poster,
  active,
  onVisible,
  onOpen,
  selected,
  onSelect,
  thumbSize,
}: SideProps) {
  const { ref, seen } = useSeen<HTMLButtonElement>(onVisible, item.path);

  return (
    <button
      ref={ref}
      type="button"
      style={{ "--side-thumb-size": `${thumbSize}px` } as CSSProperties}
      className={
        selected ? "side-clip is-selected" : active ? "side-clip is-on" : "side-clip"
      }
      onClick={(event) => {
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          onSelect(item.path, event.shiftKey);
          return;
        }
        onOpen(item.path);
      }}
    >
      <input
        type="checkbox"
        className="clip-check"
        checked={selected}
        aria-label="Select clip"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(item.path, event.shiftKey);
        }}
        onChange={() => undefined}
      />
      <span className="side-thumb">
        <Poster poster={poster} path={item.path} seen={seen || active} />
      </span>
      <span className="side-name" title={item.name}>
        {clipTitle(item.name)}
        <span className="side-meta">{formatWhen(item.mtimeMs)} · {formatBytes(item.sizeBytes)}</span>
      </span>
    </button>
  );
}
