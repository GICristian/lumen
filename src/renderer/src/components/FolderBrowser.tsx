import { useMemo, useState } from "react";
import { filterLumenFolders, folderRecency, type LumenFolder } from "@shared/lumenFolders";
import { mediaUrl } from "../player/usePlayback";
import { Icon } from "./Icon";

type Props = {
  folders: LumenFolder[];
  current: string | null;
  onOpen: (directory: string) => void;
  onBrowse: () => void;
};

function samePath(left: string | null, right: string): boolean {
  if (!left) return false;
  const normalize = (value: string): string => value.replace(/\//g, "\\").replace(/[\\/]+$/, "").toLowerCase();
  return normalize(left) === normalize(right);
}

export function FolderBrowser({ folders, current, onOpen, onBrowse }: Props) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterLumenFolders(folders, query), [folders, query]);
  return (
    <div className="lumen-browse">
      <label className="lumen-browse-search">
        <Icon name="search" />
        <input
          type="search"
          value={query}
          placeholder="Folders"
          aria-label="Search folders"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="lumen-browse-list">
        {shown.length === 0 ? <p className="lumen-browse-empty">No Lumen folders yet.</p> : null}
        {shown.map((folder) => {
          const rank = folders.findIndex((item) => item.directory === folder.directory);
          const tone = folderRecency(rank);
          const selected = samePath(current, folder.directory);
          return (
            <button
              key={folder.directory}
              type="button"
              className={`lumen-folder is-${tone}${selected ? " is-on" : ""}`}
              title={folder.directory}
              onClick={() => onOpen(folder.directory)}
            >
              {folder.iconPath ? <img src={mediaUrl(folder.iconPath)} alt="" /> : <Icon name="folder" />}
              <span>{folder.name}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="lumen-browse-windows"
        aria-label="Browse in Windows"
        title="Browse in Windows"
        onClick={onBrowse}
      >
        <Icon name="folder" />
      </button>
    </div>
  );
}
