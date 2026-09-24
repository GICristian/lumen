import { useEffect, useRef, useState } from "react";

type Props = {
  fileLabel: string;
  onOpen: () => void;
  onOverlay: () => void;
  overlayShortcut: string;
  onDefaultApps: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

export function TitleBar({
  fileLabel,
  onOpen,
  onOverlay,
  overlayShortcut,
  onDefaultApps,
  onMinimize,
  onMaximize,
  onClose,
}: Props) {
  const [open, setOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent): void => {
      if (!gearRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  return (
    <header className="titlebar">
      <div className="wordmark">Lumen</div>
      <div className="file-label" title={fileLabel}>
        {fileLabel}
      </div>
      <button type="button" className="text-btn" onClick={onOpen}>
        Open
      </button>
      <button type="button" className="text-btn" onClick={onOverlay}>
        Overlay
      </button>
      <div className="gear" ref={gearRef}>
        <button
          type="button"
          className="icon-btn"
          aria-label="Settings"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.2 3.1-1.7-.3a6.8 6.8 0 0 0-.8-1.9l1-1.4a.9.9 0 0 0-.1-1.1l-1.3-1.3a.9.9 0 0 0-1.1-.1l-1.4 1a6.8 6.8 0 0 0-1.9-.8l-.3-1.7A.9.9 0 0 0 11.7 3h-1.8a.9.9 0 0 0-.9.8l-.3 1.7a6.8 6.8 0 0 0-1.9.8l-1.4-1a.9.9 0 0 0-1.1.1L3.9 6.7a.9.9 0 0 0-.1 1.1l1 1.4a6.8 6.8 0 0 0-.8 1.9l-1.7.3a.9.9 0 0 0-.8.9v1.8c0 .4.3.8.8.9l1.7.3c.1.7.4 1.3.8 1.9l-1 1.4a.9.9 0 0 0 .1 1.1l1.3 1.3c.3.3.8.4 1.1.1l1.4-1c.6.4 1.2.7 1.9.8l.3 1.7c.1.4.5.8.9.8h1.8c.4 0 .8-.3.9-.8l.3-1.7c.7-.1 1.3-.4 1.9-.8l1.4 1c.3.3.8.2 1.1-.1l1.3-1.3c.3-.3.4-.8.1-1.1l-1-1.4c.4-.6.7-1.2.8-1.9l1.7-.3c.4-.1.8-.5.8-.9v-1.8a.9.9 0 0 0-.8-.9Z"
              fill="currentColor"
            />
          </svg>
        </button>
        {open ? (
          <div className="gear-menu">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDefaultApps();
              }}
            >
              Set as default player
            </button>
            <p>
              In Default apps, choose Lumen for video files. You can also right-click a clip,
              then Open with, Lumen, Always.
            </p>
            <p>Overlay shortcut: {overlayShortcut}. Change it from Set overlay.</p>
          </div>
        ) : null}
      </div>
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
