import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { FolderItem } from "@shared/contracts";
import { clipTitle, formatBytes, formatWhen } from "@shared/clips";
import { POSTER_FAIL, posterImage } from "../player/usePosters";
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
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisible(path);
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible, path]);
  return ref;
}

export function Poster({ poster }: { poster: string | undefined }) {
  const image = posterImage(poster);
  if (image) return <img src={image} alt="" draggable={false} />;
  const waiting = poster !== POSTER_FAIL;
  return <span className={waiting ? "clip-fallback is-wait" : "clip-fallback"} />;
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
  const ref = useSeen<HTMLElement>(onVisible, item.path);
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
        <Poster poster={poster} />
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
  const ref = useSeen<HTMLButtonElement>(onVisible, item.path);

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
        <Poster poster={poster} />
      </span>
      <span className="side-name" title={item.name}>
        {clipTitle(item.name)}
        <span className="side-meta">{formatWhen(item.mtimeMs)} · {formatBytes(item.sizeBytes)}</span>
      </span>
    </button>
  );
}
