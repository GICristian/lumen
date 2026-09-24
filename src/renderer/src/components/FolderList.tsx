import type { ReactNode } from "react";
import type { FolderItem } from "@shared/contracts";
import { mediaUrl } from "../player/usePlayback";

type Props = {
  items: FolderItem[];
  currentPath: string | null;
  thumbs: Record<string, string>;
  selected: string[];
  onOpen: (filePath: string) => void;
  onSelect: (filePath: string, extend: boolean) => void;
  deleteSlot: ReactNode;
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
  currentPath,
  thumbs,
  selected,
  onOpen,
  onSelect,
  deleteSlot,
}: Props) {
  return (
    <aside className="folder">
      <div className="folder-head">
        <span>Folder</span>
        {deleteSlot}
      </div>
      <div className="folder-list">
        {items.length === 0 ? <p className="muted pad">No videos in this folder</p> : null}
        {items.map((item) => {
          const thumb = thumbs[item.path];
          const active = item.path === currentPath;
          const picked = selected.includes(item.path);
          return (
            <div
              key={item.path}
              className={active ? "folder-row is-active" : "folder-row"}
              onClick={(event) => {
                if (event.shiftKey || event.ctrlKey || event.metaKey) {
                  onSelect(item.path, event.shiftKey);
                  return;
                }
                onOpen(item.path);
              }}
            >
              <ClipCheck checked={picked} onPick={(extend) => onSelect(item.path, extend)} />
              {thumb ? (
                <img src={mediaUrl(thumb)} alt="" />
              ) : (
                <span className="thumb-placeholder" />
              )}
              <span className="folder-name">{item.name}</span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
