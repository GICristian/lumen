type WindowProps = {
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

export function WindowControls({ onMinimize, onMaximize, onClose }: WindowProps) {
  return (
    <div className="window-controls">
      <button type="button" className="win-btn" onClick={onMinimize} aria-label="Minimize">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5h8" /></svg>
      </button>
      <button type="button" className="win-btn" onClick={onMaximize} aria-label="Maximize">
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1" /></svg>
      </button>
      <button type="button" className="win-btn close" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3L3 9" /></svg>
      </button>
    </div>
  );
}

export function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="hub-back" onClick={onClick}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5 3.5 6l4 3.5" /></svg>
      <span>{label}</span>
    </button>
  );
}
