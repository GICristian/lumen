import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipSort } from "@shared/clips";
import { filterClips, sortClips } from "@shared/clips";
import type { ExportRequest, FolderItem, Settings } from "@shared/contracts";
import { folderLabels } from "@shared/folders";
import { acceleratorFromEvent } from "@shared/shortcut";
import { fileName } from "../player/usePlayback";
import { usePosters } from "../player/usePosters";
import { ClipCard, SideClip } from "./ClipCard";
import { OverlayDetail } from "./OverlayDetail";

const emptySettings: Settings = {
  volume: 1,
  loop: false,
  preciseTrim: false,
  folderOpen: true,
  windowBounds: null,
  lastFolder: null,
  recentFolders: [],
  overlayAccelerator: "Ctrl+Alt+L",
  launchOnStartup: false,
  overlayBounds: null,
};

const sorts: { id: ClipSort; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "name", label: "Name" },
  { id: "oldest", label: "Oldest" },
  { id: "largest", label: "Largest" },
];

export function OverlayApp() {
  const jobRef = useRef<string | null>(null);
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [folder, setFolder] = useState<string | null>(null);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ClipSort>("recent");
  const [hoverPath, setHoverPath] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; path?: string } | null>(null);

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
    void window.lumen.getSettings().then((stored) => {
      setSettings(stored);
      if (stored.lastFolder) void loadFolder(stored.lastFolder);
    });
    return window.lumen.onOverlayOpen(() => {
      void window.lumen.getSettings().then((stored) => {
        setSettings(stored);
        if (stored.lastFolder) void loadFolder(stored.lastFolder);
      });
    });
  }, [loadFolder]);

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
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || capturing) return;
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
  }, [capturing, playing, query]);

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
      const result = await window.lumen.startExport(request);
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
  const visible = useMemo(() => sortClips(filterClips(items, query), sort), [items, query, sort]);
  const active = items.find((item) => item.path === playing);

  return (
    <div className="overlay-shell">
      <section className="overlay-panel">
        <header
          className="overlay-bar"
          onPointerDown={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("button, select, input, a")) return;
            window.lumen.dragOverlay();
          }}
        >
          <div className="wordmark">Lumen</div>
          <select
            className="overlay-select"
            value={folder ?? ""}
            onChange={(event) => {
              if (event.target.value) void loadFolder(event.target.value);
            }}
          >
            <option value="" disabled>
              {folder ? "Folder" : "No folder yet"}
            </option>
            {labels.map((item) => (
              <option key={item.path} value={item.path} title={item.path}>
                {item.label}
              </option>
            ))}
          </select>
          <button type="button" className="text-btn" onClick={() => void chooseFolder()}>
            Browse
          </button>
          <button
            type="button"
            className={settingsOpen ? "text-btn is-on" : "text-btn"}
            onClick={() => setSettingsOpen((value) => !value)}
          >
            Set overlay
          </button>
          <button type="button" className="text-btn" onClick={() => window.lumen.hideOverlay()}>
            Close
          </button>
        </header>
        <div className="overlay-tools">
          <input
            className="overlay-search"
            type="search"
            value={query}
            placeholder="Search clips"
            aria-label="Search clips"
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="overlay-select overlay-sort"
            value={sort}
            aria-label="Sort clips"
            onChange={(event) => setSort(event.target.value as ClipSort)}
          >
            {sorts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="overlay-count">
            {visible.length} {visible.length === 1 ? "clip" : "clips"}
          </span>
        </div>
        {settingsOpen ? (
          <div className="overlay-settings">
            <p>Shortcut: {settings.overlayAccelerator}. Alt+Z stays with NVIDIA.</p>
            <button type="button" className="text-btn" onClick={() => setCapturing(true)}>
              {capturing ? "Press Ctrl, Alt, or Shift with a key" : "Change shortcut"}
            </button>
            <label className="overlay-check">
              <input
                type="checkbox"
                checked={settings.launchOnStartup}
                onChange={(event) => {
                  void window.lumen.setLaunchOnStartup(event.target.checked).then(setSettings);
                }}
              />
              Start with Windows, so the shortcut works after a capture
            </label>
          </div>
        ) : null}
        {notice && !active ? <p className="overlay-notice">{notice}</p> : null}
        {active ? (
          <div className="overlay-watch">
            <aside className="overlay-side">
              {visible.map((item) => (
                <SideClip
                  key={item.path}
                  item={item}
                  poster={posters[item.path]}
                  active={item.path === active.path}
                  onVisible={request}
                  onOpen={setPlaying}
                />
              ))}
            </aside>
            <OverlayDetail
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
            />
          </div>
        ) : (
          <div className="overlay-grid">
            {visible.length === 0 ? (
              <div className="overlay-empty">
                <p>
                  {folder
                    ? query
                      ? "No clips match this search"
                      : "No clips in this folder"
                    : "Choose the NVIDIA captures folder"}
                </p>
                {query ? null : (
                  <button type="button" className="text-btn" onClick={() => void chooseFolder()}>
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
                  onVisible={request}
                  onHover={setHoverPath}
                  onOpen={setPlaying}
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
