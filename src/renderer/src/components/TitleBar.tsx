import { BrandMark } from "./BrandMark";
import { Icon } from "./Icon";

type Props = {
  fileLabel: string;
  onHome: () => void;
  onEdit: () => void;
  editing: boolean;
  canEdit: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

export function TitleBar({ fileLabel, onHome, onEdit, editing, canEdit, onMinimize, onMaximize, onClose }: Props) {
  return (
    <header className="titlebar">
      <button type="button" className="brand-home" onClick={onHome} aria-label="Hub">
        <BrandMark className="brand-mark-svg" />
      </button>
      <span className="titlebar-mode">{editing ? "STUDIO" : "PLAYER"}</span>
      <div className="file-label" title={fileLabel}>
        {fileLabel}
      </div>
      {canEdit ? <button type="button" className="editor-entry" onClick={onEdit}><Icon name={editing ? "play" : "edit"} />{editing ? "Back to player" : "Edit clip"}</button> : null}
      <button type="button" className="text-btn hub-link" onClick={onHome}>
        Hub
      </button>
      <div className="window-controls">
        <button type="button" className="win-btn" onClick={onMinimize} aria-label="Minimize">
          –
        </button>
        <button type="button" className="win-btn" onClick={onMaximize} aria-label="Maximize">
          □
        </button>
        <button type="button" className="win-btn close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
    </header>
  );
}
