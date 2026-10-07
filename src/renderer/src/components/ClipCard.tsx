import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { FolderItem } from "@shared/contracts";
import { clipTitle, formatBytes, formatWhen } from "@shared/clips";
import { POSTER_FAIL, posterImage } from "../player/usePosters";
import { EditMenu } from "./EditMenu";
import { Icon } from "./Icon";

type CardProps = {
  item: FolderItem;
  poster: string | undefined;
  hot: boolean;
  onVisible: (path: string) => void;
  onHover: (path: string | null) => void;
  onOpen: (path: string) => void;
  onEdit?: (path: string) => void;
  onStudio?: (path: string) => void;
  selected: boolean;
  onSelect: (path: string, extend: boolean) => void;
  favorite?: boolean;
  onFavorite?: (path: string) => void;
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
  onStudio,
  selected,
  onSelect,
  favorite = false,
  onFavorite,
}: CardProps) {
  const ref = useSeen<HTMLElement>(onVisible, item.path);
  const [revealError, setRevealError] = useState(false);

  return (
    <article
      ref={ref}
      tabIndex={0}
      aria-label={`Play ${item.name}`}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(item.path); } }}
      className={[
        "clip-card",
        selected ? "is-selected" : hot ? "is-hot" : "",
        favorite ? "is-favorite" : "",
      ].filter(Boolean).join(" ")}
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
        {onFavorite ? (
          <button
            type="button"
            className={favorite ? "clip-star is-on" : "clip-star"}
            aria-label={favorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
            aria-pressed={favorite}
            onClick={(event) => {
              event.stopPropagation();
              onFavorite(item.path);
            }}
          >
            <Icon name="star" />
          </button>
        ) : null}
        {onEdit && onStudio ? (
          <EditMenu
            label="Edit"
            className="clip-edit"
            onQuick={() => onEdit(item.path)}
            onStudio={() => onStudio(item.path)}
          />
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
  favorite?: boolean;
  onFavorite?: (path: string) => void;
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
  favorite = false,
  onFavorite,
}: SideProps) {
  const ref = useSeen<HTMLButtonElement>(onVisible, item.path);

  return (
    <button
      ref={ref}
      type="button"
      style={{ "--side-thumb-size": `${thumbSize}px` } as CSSProperties}
      className={[
        "side-clip",
        selected ? "is-selected" : "",
        active ? "is-on" : "",
        favorite ? "is-favorite" : "",
      ].filter(Boolean).join(" ")}
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
      <span className={favorite ? "side-thumb is-favorite" : "side-thumb"}>
        <Poster poster={poster} />
        {onFavorite ? (
          <span
            role="button"
            tabIndex={0}
            className={favorite ? "clip-star is-on" : "clip-star"}
            aria-label={favorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
            aria-pressed={favorite}
            onClick={(event) => {
              event.stopPropagation();
              onFavorite(item.path);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onFavorite(item.path);
            }}
          >
            <Icon name="star" />
          </span>
        ) : null}
      </span>
      <span className="side-name" title={item.name}>
        {clipTitle(item.name)}
        <span className="side-meta">{formatWhen(item.mtimeMs)} · {formatBytes(item.sizeBytes)}</span>
      </span>
    </button>
  );
}
