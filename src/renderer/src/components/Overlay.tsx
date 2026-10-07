import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ClipSort } from "@shared/clips";
import { filterClips, formatWhen, isEditedClip, sortClips } from "@shared/clips";
import { isFavorite } from "@shared/favorites";
import type { ActivityItem, ExportRequest, FolderItem, LumenFolder, Settings } from "@shared/contracts";
import { folderLabels } from "@shared/folders";
import { acceleratorFromEvent } from "@shared/shortcut";
import { fileName } from "../player/usePlayback";
import { lumenCursor } from "../player/cursor";
import { usePosters } from "../player/usePosters";
import { BrandMark } from "./BrandMark";
import { ClipCard, SideClip } from "./ClipCard";
import { FolderBrowser } from "./FolderBrowser";
import { Icon } from "./Icon";
import { DeleteClips } from "./DeleteClips";
import { OverlayDetail } from "./OverlayDetail";
import { OverlayPreview } from "./OverlayPreview";
import { UpdateBanner } from "./UpdateBanner";
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
  windowMaximized: true,
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
  replayNoiseSuppression: true,
  replayEchoCancellation: false,
  replayMicHum: true,
  replayBitrateKbps: 8000,
  replayAccelerator: "Ctrl+Alt+Shift+R",
  replayDirectory: null,
  replayDisplayId: "",
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
  const playingRef = useRef<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ClipSort>("recent");
  const [editedOnly, setEditedOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [lumenFolders, setLumenFolders] = useState<LumenFolder[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activitySeen, setActivitySeen] = useState(0);
  playingRef.current = playing;
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
        } else if (playingRef.current) {
          return;
        } else {
          const homes = await window.lumen.lumenFolders();
          if (token !== generation) return;
          setLumenFolders(homes);
          if (homes[0]) await loadFolder(homes[0].directory);
          else if (stored.lastFolder) await loadFolder(stored.lastFolder);
        }
      } catch (error) { if (token === generation) setNotice(error instanceof Error ? error.message : "Clip could not be opened."); }
    };
    const off = window.lumen.onOverlayOpen((file) => void open(file));
    void open();
    return () => { generation++; off(); };
  }, [loadFolder]);

  useEffect(() => {
    void window.lumen.favorites().then(setFavorites).catch(() => setFavorites([]));
    return window.lumen.onFavorites(setFavorites);
  }, []);

  useEffect(() => {
    let known = 0;
    const apply = (next: LumenFolder[]): void => {
      setLumenFolders(next);
      const newest = next[0];
      if (!newest) return;
      if (known && newest.savedAt > known && !playingRef.current) void loadFolder(newest.directory);
      known = Math.max(known, newest.savedAt);
    };
    void window.lumen.lumenFolders().then(apply).catch(() => setLumenFolders([]));
    return window.lumen.onLumenFolders(() => {
      void window.lumen.lumenFolders().then(apply).catch(() => undefined);
    });
  }, [loadFolder]);

  useEffect(() => {
    void window.lumen.activity().then(setActivity).catch(() => setActivity([]));
    return window.lumen.onActivity(setActivity);
  }, []);

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
    if (!folderMenu && !settingsOpen && !replayOpen && !activityOpen) return;
    const onPointer = (event: PointerEvent): void => {
      if (!barRef.current?.contains(event.target as Node)) {
        setFolderMenu(false);
        setSettingsOpen(false);
        setReplayOpen(false);
        setActivityOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [folderMenu, settingsOpen, replayOpen, activityOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || capturing) return;
      if (replayOpen || activityOpen) {
        setReplayOpen(false);
        setActivityOpen(false);
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
  }, [activityOpen, capturing, playing, query, replayOpen, settingsOpen, folderMenu]);

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
  const visible = useMemo(() => {
    const found = filterClips(items, query).filter((item) => {
      if (editedOnly && !isEditedClip(item.name)) return false;
      if (favoritesOnly && !isFavorite(favorites, item.path)) return false;
      return true;
    });
    return sortClips(found, sort);
  }, [items, query, sort, editedOnly, favoritesOnly, favorites]);
  const order = useMemo(() => visible.map((item) => item.path), [visible]);
  const selection = useClipSelection(order);
  const active = items.find((item) => item.path === playing);

  const activityFresh = activity.some((item) => item.at > activitySeen);

  async function openActivity(filePath: string): Promise<void> {
    setActivityOpen(false);
    const listing = await window.lumen.listFolder(filePath);
    setFolder(listing.folder);
    setItems(listing.items);
    setQuery("");
    setEditing(false);
    setPlaying(filePath);
    setNotice(null);
  }

  function toggleStar(filePath: string): void {
    void window.lumen.toggleFavorite(filePath).then(setFavorites).catch(() => {
      setNotice("Favorite could not be saved.");
    });
  }

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
      if (result.deleted.length > 0) {
        void window.lumen.forgetFavorites(result.deleted).then(setFavorites);
      }
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
      <UpdateBanner />
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
                setActivityOpen(false);
                setFolderMenu((value) => !value);
              }}
            >
              <Icon name="folder" />
              <span>{currentLabel}</span>
            </button>
            {folderMenu ? (
              <div className="menu-pop is-folders">
                <FolderBrowser
                  folders={lumenFolders}
                  current={folder}
                  onOpen={(directory) => {
                    setFolderMenu(false);
                    void loadFolder(directory);
                  }}
                  onBrowse={() => {
                    setFolderMenu(false);
                    void chooseFolder();
                  }}
                />
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
                setActivityOpen(false);
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
              className={activityOpen ? "icon-btn is-on" : activityFresh ? "icon-btn is-fresh" : "icon-btn"}
              aria-label="Activity"
              aria-expanded={activityOpen}
              onClick={() => {
                setFolderMenu(false);
                setReplayOpen(false);
                setSettingsOpen(false);
                setActivityOpen((value) => {
                  const next = !value;
                  if (next) setActivitySeen(Date.now());
                  return next;
                });
              }}
            >
              <Icon name="bell" />
              {activityFresh ? <i className="activity-dot" /> : null}
            </button>
            {activityOpen ? (
              <div className="menu-pop is-activity">
                {activity.length === 0 ? <p className="menu-note">Nothing recorded or exported yet.</p> : (
                  <p className="menu-note">Last {activity.length} {activity.length === 1 ? "action" : "actions"}</p>
                )}
                {activity.map((item) => (
                  <article key={item.id} className="activity-row">
                    <strong>{item.kind === "recorded" ? "Clip recorded" : "Clip exported"}</strong>
                    <span title={item.path}>{fileName(item.path)}</span>
                    <em>{formatWhen(item.at)}</em>
                    <div>
                      <button type="button" onClick={() => void openActivity(item.path)}>View</button>
                      <button type="button" onClick={() => void window.lumen.showItem(item.path)}>Show in folder</button>
                    </div>
                  </article>
                ))}
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
                setActivityOpen(false);
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
          <div className="overlay-filters">
            <button
              type="button"
              className={editedOnly ? "is-on" : ""}
              aria-pressed={editedOnly}
              onClick={() => setEditedOnly((on) => !on)}
            >
              Edited
            </button>
            <button
              type="button"
              className={favoritesOnly ? "is-on" : ""}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((on) => !on)}
            >
              Favorites
            </button>
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
                  favorite={isFavorite(favorites, item.path)}
                  onFavorite={toggleStar}
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
              favorite={isFavorite(favorites, active.path)}
              onFavorite={() => toggleStar(active.path)}
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
              onStudio={() => { void window.lumen.openStudio(active.path); }}
              favorite={isFavorite(favorites, active.path)}
              onFavorite={() => toggleStar(active.path)}
            />}
          </div>
        ) : (
          <div className="overlay-home">
          <FolderBrowser
            folders={lumenFolders}
            current={folder}
            onOpen={(directory) => void loadFolder(directory)}
            onBrowse={() => void chooseFolder()}
          />
          <div className="overlay-grid" style={{ "--overlay-card-min": `${thumbSize * 2.5}px` } as CSSProperties}>
            {visible.length === 0 ? (
              <div className="overlay-empty">
                <BrandMark className="brand-mark-svg is-large" />
                <p>
                  {folder
                    ? query
                      ? "Nothing matches that search."
                      : favoritesOnly && editedOnly
                        ? "No edited favorites in this folder."
                        : favoritesOnly
                          ? "No favorites in this folder."
                          : editedOnly
                            ? "No edited clips in this folder."
                            : "This folder has no clips yet."
                    : "Open the folder where your captures live."}
                </p>
                {query || editedOnly || favoritesOnly ? null : (
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
                  onStudio={(path) => { void window.lumen.openStudio(path); }}
                  onSelect={selection.pick}
                  favorite={isFavorite(favorites, item.path)}
                  onFavorite={toggleStar}
                />
              ))
            )}
          </div>
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
