import type { FolderItem } from "@shared/contracts";
import { mediaUrl } from "../player/usePlayback";

type Props = {
  items: FolderItem[];
  currentPath: string | null;
  thumbs: Record<string, string>;
  onOpen: (filePath: string) => void;
};

export function FolderList({ items, currentPath, thumbs, onOpen }: Props) {
  return (
    <aside className="folder">
      <div className="folder-head">Folder</div>
      <div className="folder-list">
        {items.length === 0 ? <p className="muted pad">No videos in this folder</p> : null}
        {items.map((item) => {
          const thumb = thumbs[item.path];
          const active = item.path === currentPath;
          return (
            <button
              key={item.path}
              type="button"
              className={active ? "folder-row is-active" : "folder-row"}
              onClick={() => onOpen(item.path)}
            >
              {thumb ? (
                <img src={mediaUrl(thumb)} alt="" />
              ) : (
                <span className="thumb-placeholder" />
              )}
              <span className="folder-name">{item.name}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
