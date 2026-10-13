import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SavedTheme, ThemeDraft } from "@shared/theme";
import { ActivityBell } from "./ActivityBell";
import { BrandLockup, BrandMark } from "./BrandMark";
import { HubSettings } from "./HubSettings";
import { Icon } from "./Icon";
import { ReplayPanel } from "./ReplayPanel";
import { BackButton, WindowControls } from "./WindowChrome";

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
  screenshotShortcut: string;
  theme: ThemeDraft;
  savedThemes: SavedTheme[];
  activeSavedId: string | null;
  onTheme: (draft: ThemeDraft) => Promise<void>;
  onSaveTheme: (name: string) => Promise<void>;
  onApplySaved: (theme: SavedTheme) => Promise<void>;
  onDeleteSaved: (id: string) => Promise<void>;
  onShortcut: (which: "overlay" | "vault" | "screenshot", accelerator: string) => Promise<void>;
  onLaunch: (enabled: boolean) => Promise<void>;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
};

export function Hub({
  page,
  shortcut,
  vaultShortcut,
  screenshotShortcut,
  theme,
  savedThemes,
  activeSavedId,
  onTheme,
  onSaveTheme,
  onApplySaved,
  onDeleteSaved,
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
  const wheelLock = useRef(0);
  const wheelBox = useRef<HTMLDivElement>(null);
  const [wheel, setWheel] = useState(0);
  const actions: {
    title: string;
    detail: string;
    icon: "folder" | "screen" | "replay" | "edit" | "lock" | "sliders";
    onClick: () => void;
  }[] = [
    {
      title: folderName ?? "Library",
      detail: folderName ? "Open the clips in this folder" : "Choose a folder of clips",
      icon: "folder",
      onClick: onOpenLibrary,
    },
    {
      title: "Overlay",
      detail: `Float the library over the desktop · ${shortcut}`,
      icon: "screen",
      onClick: onOverlay,
    },
    {
      title: "Replay",
      detail: "Keep the last few minutes",
      icon: "replay",
      onClick: onOpenReplay,
    },
    {
      title: "Editor",
      detail: "Split, trim and export",
      icon: "edit",
      onClick: onOpenEditor,
    },
    {
      title: "Vault",
      detail: "Clips behind a password",
      icon: "lock",
      onClick: onOpenVault,
    },
    {
      title: "Settings",
      detail: "Theme, shortcuts and cursor",
      icon: "sliders",
      onClick: onOpenSettings,
    },
  ];
  useEffect(() => {
    wheelBox.current?.querySelector<HTMLElement>(".is-focus")?.scrollIntoView({ block: "nearest" });
  }, [wheel]);

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
          <BackButton onClick={onBack} />
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
        <WindowControls onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} />
      </header>
      {page === "settings" ? (
        <HubSettings
          overlayShortcut={shortcut}
          vaultShortcut={vaultShortcut}
          screenshotShortcut={screenshotShortcut}
          theme={theme}
          savedThemes={savedThemes}
          activeSavedId={activeSavedId}
          onTheme={onTheme}
          onSaveTheme={onSaveTheme}
          onApplySaved={onApplySaved}
          onDeleteSaved={onDeleteSaved}
          launchOnStartup={launchOnStartup}
          cursorSize={cursorSize}
          onCursorSize={onCursorSize}
          exportDirectory={exportDirectory}
          onExportDirectory={onExportDirectory}
          onShortcut={onShortcut}
          onLaunch={onLaunch}
          onReplay={onOpenReplay}
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
          <div
            className="hub-side hub-wheel"
            ref={wheelBox}
            onWheel={(event) => {
              event.preventDefault();
              const now = performance.now();
              if (now - wheelLock.current < 160) return;
              wheelLock.current = now;
              const step = event.deltaY > 0 ? 1 : -1;
              setWheel((value) => Math.min(actions.length - 1, Math.max(0, value + step)));
            }}
          >
            {actions.map((action, index) => {
              const distance = Math.min(3, Math.abs(index - wheel));
              return (
                <button
                  key={action.title}
                  type="button"
                  className={index === wheel ? "hub-card hub-tile is-focus" : "hub-card hub-tile"}
                  style={{ "--wheel-distance": distance } as CSSProperties}
                  onMouseEnter={() => setWheel(index)}
                  onFocus={() => setWheel(index)}
                  onClick={action.onClick}
                >
                  <span className="hub-glyph"><Icon name={action.icon} /></span>
                  <span className="hub-copy">
                    <strong>{action.title}</strong>
                    <p>{action.detail}</p>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <footer className="hub-footer"><span><i /> LOCAL FILES. FULL FOCUS.</span><span>Drop a video anywhere to begin <span aria-hidden="true">↗</span></span></footer>
        </>
      )}
    </div>
  );
}
