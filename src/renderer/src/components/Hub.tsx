import { ActivityBell } from "./ActivityBell";
import { BrandLockup, BrandMark } from "./BrandMark";
import { HubSettings } from "./HubSettings";
import { Icon } from "./Icon";
import { ReplayPanel } from "./ReplayPanel";

type Props = {
  page: "home" | "settings" | "replay";
  shortcut: string;
  vaultShortcut: string;
  launchOnStartup: boolean;
  cursorSize: number;
  onCursorSize: (size: number) => void;
  exportDirectory: string | null;
  onExportDirectory: () => void;
  folderName: string | null;
  dropping: boolean;
  onOpenFile: () => void;
  onOpenEditor: () => void;
  onViewActivity?: (filePath: string) => void;
  onOpenLibrary: () => void;
  onOverlay: () => void;
  onOpenSettings: () => void;
  onOpenReplay: () => void;
  onOpenVault: () => void;
  onBack: () => void;
  onShortcut: (which: "overlay" | "vault", accelerator: string) => Promise<void>;
  onLaunch: (enabled: boolean) => Promise<void>;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

export function Hub({
  page,
  shortcut,
  vaultShortcut,
  launchOnStartup,
  cursorSize,
  onCursorSize,
  exportDirectory,
  onExportDirectory,
  folderName,
  dropping,
  onOpenFile,
  onOpenEditor,
  onViewActivity,
  onOpenLibrary,
  onOverlay,
  onOpenSettings,
  onOpenReplay,
  onOpenVault,
  onBack,
  onShortcut,
  onLaunch,
  onMinimize,
  onMaximize,
  onClose,
}: Props) {
  return (
    <div className={dropping ? "hub is-drop" : "hub"} onPointerMove={(event) => {
      if (event.pointerType !== "mouse") return;
      const card = (event.target as HTMLElement).closest<HTMLElement>(".hub-card");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
      card.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
    }}>
      <header className="hub-bar">
        {page === "home" ? (
          <>
            <BrandMark className="brand-mark-svg" />
            <span className="hub-word">Lumen</span>
          </>
        ) : (
          <button type="button" className="hub-back" onClick={onBack}>
            Back
          </button>
        )}
        <div className="hub-spacer" />
        {page === "home" ? (
          <>
            <ActivityBell onView={onViewActivity} />
            <button type="button" className="hub-replay-entry" onClick={onOpenReplay}>
              <Icon name="record" />
              Replay
            </button>
          </>
        ) : null}
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
      {page === "settings" ? (
        <HubSettings
          overlayShortcut={shortcut}
          vaultShortcut={vaultShortcut}
          launchOnStartup={launchOnStartup}
          cursorSize={cursorSize}
          onCursorSize={onCursorSize}
          exportDirectory={exportDirectory}
          onExportDirectory={onExportDirectory}
          onShortcut={onShortcut}
          onLaunch={onLaunch}
        />
      ) : page === "replay" ? (
        <ReplayPanel />
      ) : (
        <>
        <div className="hub-intro">
          <span>THE PERSONAL PICTURE HOUSE</span>
          <strong>Made for the moment.</strong>
          <p>Your films. Your footage. Your point of view.</p>
        </div>
        <div className="hub-grid">
          <button type="button" className="hub-card hub-player" onClick={onOpenFile}>
            <div className="hub-stage">
              <span className="hub-stage-label">LUMEN / PICTURE HOUSE</span>
              <span className="frame-corner top-left" /><span className="frame-corner top-right" />
              <span className="frame-corner bottom-left" /><span className="frame-corner bottom-right" />
              <BrandLockup className="hub-lockup" />
              <span className="hub-stage-caption">A little less interface. A little more cinema.</span>
            </div>
            <div className="hub-copy">
              <span className="hub-kicker">Player</span>
              <strong>Take a closer look.<span className="hub-open-action"><Icon name="play" /> Open video</span></strong>
              <p>Open a file, or drop it anywhere on this window.</p>
            </div>
          </button>
          <div className="hub-side">
            <button
              type="button"
              className="hub-card hub-tile hub-library"
              onClick={onOpenLibrary}
            >
              <span className="hub-glyph">
                <Icon name="folder" />
              </span>
              <span className="hub-copy">
                <span className="hub-kicker">Library</span>
                <strong>{folderName ?? "Open a folder"}</strong>
                <p>{folderName ? "Clips from the last folder." : "Browse the clips on disk."}</p>
              </span>
            </button>
            <button type="button" className="hub-card hub-tile hub-overlay" onClick={onOverlay}>
              <span className="hub-glyph">
                <BrandMark className="brand-mark-svg" />
              </span>
              <span className="hub-copy">
                <span className="hub-kicker">Overlay</span>
                <strong>Over the desktop</strong>
                <p>{shortcut}</p>
              </span>
            </button>
            <button type="button" className="hub-card hub-tile hub-replay" onClick={onOpenReplay}>
              <span className="hub-glyph">
                <Icon name="record" />
              </span>
              <span className="hub-copy">
                <span className="hub-kicker">Capture</span>
                <strong>Replay</strong>
                <p>Screen, sound and mic.</p>
              </span>
            </button>
            <button
              type="button"
              className="hub-card hub-tile hub-settings"
              onClick={onOpenSettings}
            >
              <span className="hub-glyph">
                <Icon name="gear" />
              </span>
              <span className="hub-copy">
                <span className="hub-kicker">Settings</span>
                <strong>Make it yours</strong>
                <p>Appearance, cursor and shortcuts.</p>
              </span>
            </button>
            <button type="button" className="hub-card hub-tile hub-editor" onClick={onOpenEditor}>
              <span className="hub-glyph"><Icon name="edit" /></span>
              <span className="hub-copy">
                <span className="hub-kicker">Studio</span>
                <strong>Open editor</strong>
                <p>Timeline, media and export.</p>
              </span>
            </button>
            <button type="button" className="hub-card hub-tile hub-vault" onClick={onOpenVault}>
              <span className="hub-glyph"><Icon name="lock" /></span>
              <span className="hub-copy">
                <span className="hub-kicker">Private</span>
                <strong>Vault</strong>
                <p>Password protected, always.</p>
              </span>
            </button>
          </div>
        </div>
        <footer className="hub-footer"><span><i /> LOCAL FILES. FULL FOCUS.</span><span>Drop a video anywhere to begin <span aria-hidden="true">↗</span></span></footer>
        </>
      )}
    </div>
  );
}
