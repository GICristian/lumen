import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { FolderItem, LumenFolder } from "@shared/contracts";
import type { ClipSort } from "@shared/clips";
import { formatBytes, formatWhen } from "@shared/clips";
import { isFavorite } from "@shared/favorites";
import { Poster } from "./ClipCard";
import { EditMenu } from "./EditMenu";
import { FolderBrowser } from "./FolderBrowser";
import { Icon } from "./Icon";

type Props = {
  items: FolderItem[];
  folderName: string | null;
  recentFolders: string[];
  currentPath: string | null;
  posters: Record<string, string>;
  selected: string[];
  sort: ClipSort;
  thumbSize: number;
  pinned: boolean;
  onSort: (sort: ClipSort) => void;
  onThumbSize: (size: number) => void;
  onTogglePinned: () => void;
  onOpen: (filePath: string) => void;
  onVisible: (filePath: string) => void;
  onChangeFolder: () => void;
  onSelectFolder: (path: string) => void;
  onEdit: (filePath: string) => void;
  onStudio: (filePath: string) => void;
  onSelect: (filePath: string, extend: boolean) => void;
  deleteSlot: ReactNode;
  lumenFolders: LumenFolder[];
  folderPath: string | null;
  favorites: string[];
  onFavorite: (filePath: string) => void;
};

function ClipCheck({
  checked,
  onPick,
}: {
  checked: boolean;
  onPick: (extend: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className="clip-check"
      checked={checked}
      aria-label="Select clip"
      onClick={(event) => {
        event.stopPropagation();
        onPick(event.shiftKey);
      }}
      onChange={() => undefined}
    />
  );
}

export function FolderList({
  items,
  folderName,
  recentFolders,
  currentPath,
  posters,
  selected,
  sort,
  thumbSize,
  pinned,
  onSort,
  onThumbSize,
  onTogglePinned,
  onOpen,
  onVisible,
  onChangeFolder,
  onSelectFolder,
  onEdit,
  onStudio,
  onSelect,
  deleteSlot,
  lumenFolders,
  folderPath,
  favorites,
  onFavorite,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  useEffect(() => {
    if (!folderMenuOpen) return;
    const close = (event: PointerEvent): void => { if (!headRef.current?.contains(event.target as Node)) setFolderMenuOpen(false); };
    const escape = (event: KeyboardEvent): void => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setFolderMenuOpen(false); headRef.current?.querySelector<HTMLButtonElement>(".folder-switch")?.focus(); } };
    window.addEventListener("pointerdown", close);
    headRef.current?.addEventListener("keydown", escape);
    const head = headRef.current;
    return () => { window.removeEventListener("pointerdown", close); head?.removeEventListener("keydown", escape); };
  }, [folderMenuOpen]);
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const filePath = (entry.target as HTMLElement).dataset.videoPath;
        if (filePath) onVisible(filePath);
      }
    }, { root, rootMargin: "180px 0px" });
    root.querySelectorAll<HTMLElement>("[data-video-path]").forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [items, onVisible]);

  return (
    <aside aria-label="Video library" className={pinned ? "folder is-pinned" : "folder"} style={{ "--clip-thumb-width": `${thumbSize}px` } as CSSProperties}>
      <div className="folder-head" ref={headRef}>
        <div className="folder-head-top">
          <span className="folder-heading">Library <span className="library-count">{items.length}</span></span>
          <button type="button" className="folder-switch" aria-label="Change folder" aria-expanded={folderMenuOpen} onClick={() => setFolderMenuOpen((value) => !value)}>
            <Icon name="folder" /><span>Change folder</span><span className="folder-chevron">⌄</span>
          </button>
        </div>
        {folderMenuOpen ? (
          <div className="folder-recent-menu" role="menu" aria-label="Recent folders">
            <span className="folder-menu-caption">Recent folders</span>
            {recentFolders.length > 0 ? recentFolders.slice(0, 6).map((path) => (
              <button key={path} type="button" className={folderLabel(path) === folderName ? "folder-recent is-active" : "folder-recent"} title={path} role="menuitem" onClick={() => { setFolderMenuOpen(false); onSelectFolder(path); }}>
                <Icon name="folder" /><span>{folderLabel(path)}</span>
              </button>
            )) : <span className="folder-recent-empty">No recent folders yet</span>}
            <button type="button" className="folder-browse" onClick={() => { setFolderMenuOpen(false); onChangeFolder(); }}>
              Browse for folder…
            </button>
          </div>
        ) : null}
        <div className="folder-location" title={folderName ?? "No folder selected"}>
          {folderName ?? "Choose a folder to browse"}
        </div>
        <div className="folder-toolbar">
          <select value={sort} aria-label="Sort clips" onChange={(event) => onSort(event.target.value as ClipSort)}>
            <option value="recent">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name</option>
            <option value="largest">Largest</option>
          </select>
          <label className="folder-density" title="Preview size">
            <span>Size</span>
            <input type="range" min={48} max={96} step={8} value={thumbSize} aria-label="Preview size" onChange={(event) => onThumbSize(Number(event.target.value))} />
          </label>
          <button type="button" className={pinned ? "folder-pin is-on" : "folder-pin"} aria-label={pinned ? "Auto-hide library" : "Keep library open"} title={pinned ? "Auto-hide library" : "Keep library open"} aria-pressed={pinned} onClick={onTogglePinned}>
            {pinned ? "Pinned" : "Pin"}
          </button>
        </div>
        {deleteSlot}
        <FolderBrowser
          folders={lumenFolders}
          current={folderPath}
          onOpen={onSelectFolder}
          onBrowse={onChangeFolder}
        />
      </div>
      <div className="folder-list" ref={listRef}>
        {items.length === 0 ? <p className="muted pad">No videos in this folder</p> : null}
        {items.map((item) => {
          const active = item.path === currentPath;
          const picked = selected.includes(item.path);
          return (
            <div
              key={item.path}
              data-video-path={item.path}
              className={`folder-row${active ? " is-active" : ""}${picked ? " is-selected" : ""}${isFavorite(favorites, item.path) ? " is-favorite" : ""}`}
              tabIndex={0}
              aria-label={`Play ${item.name}${active ? ", current clip" : ""}`}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(item.path); }
              }}
              onClick={(event) => {
                if (event.shiftKey || event.ctrlKey || event.metaKey) {
                  onSelect(item.path, event.shiftKey);
                  return;
                }
                onOpen(item.path);
              }}
            >
              <ClipCheck checked={picked} onPick={(extend) => onSelect(item.path, extend)} />
              <span className={isFavorite(favorites, item.path) ? "folder-thumb is-favorite" : "folder-thumb"}>
                <Poster poster={posters[item.path]} />
                <span
                  role="button"
                  tabIndex={0}
                  className={isFavorite(favorites, item.path) ? "clip-star is-on" : "clip-star"}
                  aria-label={isFavorite(favorites, item.path) ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`}
                  aria-pressed={isFavorite(favorites, item.path)}
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
              </span>
              <span className="folder-labels">
                <span className="folder-name" title={item.name}>{item.name}</span>
                <span className="folder-meta">{formatWhen(item.mtimeMs)} · {formatBytes(item.sizeBytes)}</span>
              </span>
              <EditMenu
                label="Edit"
                className="folder-edit"
                showIcon={false}
                onQuick={() => onEdit(item.path)}
                onStudio={() => onStudio(item.path)}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function folderLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
