import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ClipSort } from "@shared/clips";
import { filterClips, sortClips } from "@shared/clips";
import type { ExportRequest, FolderItem, Settings } from "@shared/contracts";
import { folderLabels } from "@shared/folders";
import { acceleratorFromEvent } from "@shared/shortcut";
import { fileName } from "../player/usePlayback";
import { lumenCursor } from "../player/cursor";
import { usePosters } from "../player/usePosters";
import { BrandMark } from "./BrandMark";
import { ClipCard, SideClip } from "./ClipCard";
import { Icon } from "./Icon";
import { DeleteClips } from "./DeleteClips";
import { OverlayDetail } from "./OverlayDetail";
import { OverlayPreview } from "./OverlayPreview";
import { ReplayPanel } from "./ReplayPanel";
import { useClipSelection } from "../player/useSelection";
import { useIdleCursor } from "../player/useIdleCursor";

const emptySettings: Settings = {
  volume: 1,
  loop: false,
  preciseTrim: false,
  folderOpen: true,
  libraryPinned: false,
  windowBounds: null,
  lastFolder: null,
  recentFolders: [],
  overlayAccelerator: "Ctrl+Alt+L",
  vaultAccelerator: "Ctrl+Alt+Shift+V",
  launchOnStartup: false,
  overlayBounds: null,
  cueStyle: {
    size: 22,
    color: "#ffffff",
    backdrop: 0.72,
    outline: 2,
    lift: 10,
  },
  subtitleLanguage: "rum",
  exportDirectory: null,
  cursorSize: 24,
  replaySeconds: 60,
  replayAutoStart: true,
  replayFps: 30,
  replayHeight: 1080,
  replayMic: true,
  replayMicDeviceId: "",
  replayMicGain: 1,
  replaySystemAudio: true,
  replaySystemGain: 1,
  replayNoiseSuppression: false,
  replayEchoCancellation: false,
  replayBitrateKbps: 8000,
  replayAccelerator: "Ctrl+Alt+Shift+R",
  replayDirectory: null,
};

const sorts: { id: ClipSort; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "name", label: "Name" },
  { id: "oldest", label: "Oldest" },
  { id: "largest", label: "Largest" },
];

export function OverlayApp() {
  const cursorIdle = useIdleCursor();
  const jobRef = useRef<string | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [folder, setFolder] = useState<string | null>(null);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ClipSort>("recent");
  const [thumbSize, setThumbSize] = useState(72);
  const [hoverPath, setHoverPath] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayOn, setReplayOn] = useState(false);
  const [folderMenu, setFolderMenu] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; path?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadFolder = useCallback(async (next: string) => {
    setFolder(next);
    setPlaying(null);
    setHoverPath(null);
    setQuery("");
    setNotice(null);
    try {
      const listing = await window.lumen.listDirectory(next);
      setItems(listing.items);
      setFolder(listing.folder);
      const fresh = await window.lumen.getSettings();
      setSettings(fresh);
    } catch (error) {
      setItems([]);
      setNotice(error instanceof Error ? error.message : "Folder not found");
    }
  }, []);

  useEffect(() => {
    let generation = 0;
    const open = async (file?: string): Promise<void> => {
      const token = ++generation;
      try {
        const pending = await window.lumen.overlayPendingFile();
        const target = file ?? pending;
        const stored = await window.lumen.getSettings();
        if (token !== generation) return;
        setSettings(stored);
        if (target) {
          const listing = await window.lumen.listFolder(target);
          if (token !== generation) return;
          setFolder(listing.folder); setItems(listing.items); setQuery("");
          setEditing(false); setPlaying(target); setNotice(null);
          setReplayOpen(false); setSettingsOpen(false);
        } else if (stored.lastFolder) await loadFolder(stored.lastFolder);
      } catch (error) { if (token === generation) setNotice(error instanceof Error ? error.message : "Clip could not be opened."); }
    };
    const off = window.lumen.onOverlayOpen((file) => void open(file));
    void open();
    return () => { generation++; off(); };
  }, [loadFolder]);

  useEffect(() => {
    const off = window.lumen.onReplayStatus((next) => setReplayOn(next.armed));
    void window.lumen.replayStatus().then((next) => setReplayOn(next.armed));
    return off;
  }, []);

  const { posters, request } = usePosters(items);

  useEffect(() => {
    const ownsJob = (jobId: string): boolean =>
      jobRef.current === jobId || jobRef.current === "pending";
    const offProgress = window.lumen.onExportProgress((payload) => {
      if (!ownsJob(payload.jobId)) return;
      jobRef.current = payload.jobId;
      setProgress(payload.ratio);
    });
    const offDone = window.lumen.onExportDone((payload) => {
      if (!ownsJob(payload.jobId)) return;
      jobRef.current = null;
      setProgress(null);
      setToast({ text: `Saved ${fileName(payload.outputPath)}`, path: payload.outputPath });
    });
    const offError = window.lumen.onExportError((payload) => {
      if (!ownsJob(payload.jobId)) return;
      jobRef.current = null;
      setProgress(null);
      setNotice(payload.message);
    });
    return () => {
      offProgress();
      offDone();
      offError();
    };
  }, []);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      const shortcut = acceleratorFromEvent(event);
      if (!shortcut) return;
      setCapturing(false);
      void window.lumen.setOverlayShortcut(shortcut).then(setSettings).catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : "Shortcut was not saved");
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing]);

  useEffect(() => {
    if (!folderMenu && !settingsOpen && !replayOpen) return;
    const onPointer = (event: PointerEvent): void => {
      if (!barRef.current?.contains(event.target as Node)) {
        setFolderMenu(false);
        setSettingsOpen(false);
        setReplayOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [folderMenu, settingsOpen, replayOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || capturing) return;
      if (replayOpen) {
        setReplayOpen(false);
        return;
      }
      if (settingsOpen || folderMenu) {
        setSettingsOpen(false);
        setFolderMenu(false);
        return;
      }
      if (playing) {
        setPlaying(null);
        return;
      }
      if (query && event.target instanceof HTMLInputElement) {
        setQuery("");
        return;
      }
      window.lumen.hideOverlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capturing, playing, query, replayOpen, settingsOpen, folderMenu]);

  async function chooseFolder(): Promise<void> {
    const picked = await window.lumen.openFolder();
    if (picked) await loadFolder(picked);
  }

  async function download(request: ExportRequest): Promise<void> {
    if (jobRef.current) return;
    jobRef.current = "pending";
    setProgress(0);
    setNotice(null);
    try {
      const outputPath = await window.lumen.chooseExportPath(request.sourcePath, request.precise ? "edit" : "trim");
      if (!outputPath) {
        jobRef.current = null;
        setProgress(null);
        return;
      }
      const result = await window.lumen.startExport({ ...request, outputPath });
      if (jobRef.current === "pending") jobRef.current = result.jobId;
    } catch (error) {
      if (jobRef.current === "pending") jobRef.current = null;
      setProgress(null);
      setNotice(error instanceof Error ? error.message : "Export failed");
    }
  }

  const known = settings.recentFolders.includes(folder ?? "")
    ? settings.recentFolders
    : folder
      ? [folder, ...settings.recentFolders]
      : settings.recentFolders;
  const labels = folderLabels(known);
  const currentLabel = labels.find((item) => item.path === folder)?.label ?? "Choose folder";
  const visible = useMemo(() => sortClips(filterClips(items, query), sort), [items, query, sort]);
  const order = useMemo(() => visible.map((item) => item.path), [visible]);
  const selection = useClipSelection(order);
  const active = items.find((item) => item.path === playing);

  async function removeSelected(): Promise<void> {
    const paths = selection.selected;
    if (paths.length === 0) return;
    if (playing && paths.includes(playing)) setPlaying(null);
    setConfirmDelete(false);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    try {
      const result = await window.lumen.deleteClips(paths);
      selection.clear();
      const gone = new Set(result.deleted);
      setItems((current) => current.filter((item) => !gone.has(item.path)));
      if (result.failed.length > 0) {
        setNotice(`${result.failed.length} clip${result.failed.length === 1 ? "" : "s"} could not be deleted`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Delete failed");
    }
  }

  return (
    <div className={cursorIdle ? "overlay-shell is-cursor-idle" : "overlay-shell"} style={{
      "--lumen-cursor": lumenCursor(settings.cursorSize),
    } as CSSProperties}>
      <section className="overlay-panel">
      <header
          className="overlay-bar"
          ref={barRef}
          onPointerDown={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("button, input, a, label")) return;
            window.lumen.dragOverlay();
          }}
        >
          <BrandMark className="brand-mark-svg" />
          <div className="folder-anchor">
            <button
              type="button"
              className="folder-current"
              aria-expanded={folderMenu}
              onClick={() => {
                setSettingsOpen(false);
                setReplayOpen(false);
                setFolderMenu((value) => !value);
              }}
            >
              <Icon name="folder" />
              <span>{currentLabel}</span>
            </button>
            {folderMenu ? (
              <div className="menu-pop">
                {labels.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    className={item.path === folder ? "menu-row is-on" : "menu-row"}
                    title={item.path}
                    onClick={() => {
                      setFolderMenu(false);
                      void loadFolder(item.path);
                    }}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="menu-row"
                  onClick={() => {
                    setFolderMenu(false);
                    void chooseFolder();
                  }}
                >
                  <span>Browse…</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className="overlay-spacer" />
          <div className="settings-anchor">
            <button
              type="button"
              className={replayOn ? "icon-btn is-live" : replayOpen ? "icon-btn is-on" : "icon-btn"}
              aria-label="Replay"
              aria-expanded={replayOpen}
              onClick={() => {
                setFolderMenu(false);
                setSettingsOpen(false);
                setCapturing(false);
                setReplayOpen((value) => !value);
              }}
            >
              <Icon name="record" />
            </button>
            {replayOpen ? (
              <div className="menu-pop is-replay">
                <ReplayPanel compact />
              </div>
            ) : null}
          </div>
          <div className="settings-anchor">
            <button
              type="button"
              className={settingsOpen ? "icon-btn is-on" : "icon-btn"}
              aria-label="Overlay settings"
              aria-expanded={settingsOpen}
              onClick={() => {
                setFolderMenu(false);
                setReplayOpen(false);
                setSettingsOpen((value) => !value);
              }}
            >
              <Icon name="gear" />
            </button>
            {settingsOpen ? (
              <div className="menu-pop is-settings">
                <p className="menu-note">
                  Shortcut {settings.overlayAccelerator}. Alt+Z stays with NVIDIA.
                </p>
                <button type="button" className="menu-row" onClick={() => setCapturing(true)}>
                  <span>
                    {capturing ? "Press Ctrl, Alt, or Shift with a key" : "Change shortcut"}
                  </span>
                </button>
                <label className="menu-row is-static overlay-cursor-row">
                  <span>Cursor size</span>
                  <input type="range" min={16} max={40} step={2} value={settings.cursorSize} aria-label="Cursor size" onChange={(event) => {
                    const cursorSize = Number(event.target.value);
                    setSettings((current) => ({ ...current, cursorSize }));
                    void window.lumen.setSettings({ cursorSize });
                  }} />
                  <em>{settings.cursorSize}px</em>
                </label>
                <label className="menu-row is-static">
                  <span>Start with Windows</span>
                  <input
                    type="checkbox"
                    checked={settings.launchOnStartup}
                    onChange={(event) => {
                      void window.lumen.setLaunchOnStartup(event.target.checked).then(setSettings);
                    }}
                  />
                </label>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={() => window.lumen.hideOverlay()}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="overlay-tools">
          <label className="overlay-search">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              placeholder="Search clips"
              aria-label="Search clips"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="sort-chips" role="radiogroup" aria-label="Sort clips">
            {sorts.map((item) => (
              <button
                key={item.id}
                type="button"
                className={sort === item.id ? "is-on" : ""}
                onClick={() => setSort(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="overlay-density" title="Preview size">
            <span>Size</span>
            <input type="range" min={48} max={112} step={8} value={thumbSize} aria-label="Preview size" onChange={(event) => setThumbSize(Number(event.target.value))} />
          </label>
          <span className="overlay-count">
            {visible.length}
          </span>
          <DeleteClips
            count={selection.selected.length}
            pending={confirmDelete}
            onAsk={() => setConfirmDelete(true)}
            onConfirm={() => void removeSelected()}
            onCancel={() => setConfirmDelete(false)}
          />
        </div>
        {notice && !active ? <p className="overlay-notice">{notice}</p> : null}
        {active ? (
          <div className="overlay-watch">
            <aside className="overlay-side" style={{ "--overlay-thumb-size": `${thumbSize}px` } as CSSProperties}>
              {visible.map((item) => (
                <SideClip
                  key={item.path}
                  item={item}
                  poster={posters[item.path]}
                  active={item.path === active.path}
                  selected={selection.selected.includes(item.path)}
                  onVisible={request}
                  onOpen={(path) => { setPlaying(path); setEditing(false); }}
                  onSelect={selection.pick}
                  thumbSize={thumbSize}
                />
              ))}
            </aside>
            {editing ? <OverlayDetail
              item={active}
              volume={settings.volume}
              busy={jobRef.current !== null || progress !== null}
              progress={progress}
              onBack={() => setPlaying(null)}
              onVolume={(value) => {
                setSettings((current) => ({ ...current, volume: value }));
                void window.lumen.setSettings({ volume: value });
              }}
              onExport={(request) => void download(request)}
              status={notice}
              onCancel={() => {
                const id = jobRef.current;
                if (!id) return;
                void window.lumen.cancelExport(id);
                jobRef.current = null;
                setProgress(null);
              }}
            /> : <OverlayPreview
              item={active}
              volume={settings.volume}
              onVolume={(value) => {
                setSettings((current) => ({ ...current, volume: value }));
                void window.lumen.setSettings({ volume: value });
              }}
              onBack={() => setPlaying(null)}
              onEdit={() => setEditing(true)}
            />}
          </div>
        ) : (
          <div className="overlay-grid" style={{ "--overlay-card-min": `${thumbSize * 2.5}px` } as CSSProperties}>
            {visible.length === 0 ? (
              <div className="overlay-empty">
                <BrandMark className="brand-mark-svg is-large" />
                <p>
                  {folder
                    ? query
                      ? "Nothing matches that search."
                      : "This folder has no clips yet."
                    : "Open the folder where your captures live."}
                </p>
                {query ? null : (
                  <button type="button" className="export-btn" onClick={() => void chooseFolder()}>
                    Browse
                  </button>
                )}
              </div>
            ) : (
              visible.map((item) => (
                <ClipCard
                  key={item.path}
                  item={item}
                  poster={posters[item.path]}
                  hot={hoverPath === item.path}
                  selected={selection.selected.includes(item.path)}
                  onVisible={request}
                  onHover={setHoverPath}
                  onOpen={(path) => { setPlaying(path); setEditing(false); }}
                  onEdit={(path) => { setPlaying(path); setEditing(true); }}
                  onSelect={selection.pick}
                />
              ))
            )}
          </div>
        )}
        <div className="overlay-resize" aria-hidden="true" />
      </section>
      {toast ? (
        <div className="toast overlay-toast">
          <span>{toast.text}</span>
          {toast.path ? (
            <button type="button" onClick={() => void window.lumen.showItem(toast.path!)}>
              Show in folder
            </button>
          ) : null}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
