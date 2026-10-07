import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { FolderItem, LumenFolder, VaultItem } from "@shared/contracts";
import { sortClips, type ClipSort } from "@shared/clips";
import type { VideoRect } from "@shared/crop";
import { defaultCrop } from "@shared/crop";
import { isVideoName, siblingIndex } from "@shared/library";
import { keyAction } from "@shared/keyboard";
import { requiresStreamCopy, type Probe } from "@shared/probe";
import { setMark, type Marks } from "@shared/range";
import { applySeek } from "@shared/seek";
import { clampVolume, stepVolume } from "@shared/volume";
import { cueAt, defaultCueStyle, parseVtt, type Cue, type CueStyle } from "@shared/cues";
import { DeleteClips } from "./components/DeleteClips";
import { Hub } from "./components/Hub";
import { VaultPane } from "./components/VaultPane";
import { OverlayDetail } from "./components/OverlayDetail";
import { FolderList } from "./components/FolderList";
import { Timeline } from "./components/Timeline";
import { TitleBar } from "./components/TitleBar";
import { StudioBoard, type StudioSeed } from "./components/StudioBoard";
import { UpdateBanner } from "./components/UpdateBanner";
import { Transport } from "./components/Transport";
import { VideoStage, type VideoStageHandle } from "./components/VideoStage";
import { fileName, formatClock, seekLabel, useChromeFade, useOsd } from "./player/usePlayback";
import { usePosters } from "./player/usePosters";
import { useClipSelection } from "./player/useSelection";
import { useIdleCursor } from "./player/useIdleCursor";
import { lumenCursor } from "./player/cursor";
import { pausePlayback, resumePlayback } from "./player/resumePlayback";

const unplayable = "This clip can't be played. You can still export it if ffmpeg can read it.";

type Frame = { width: number; height: number };

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<VideoStageHandle>(null);
  const homeFn = useRef<() => void>(() => undefined);
  const jobRef = useRef<string | null>(null);
  const volumeRef = useRef(1);
  const mediaGeneration = useRef(0);
  const previewFallback = useRef(false);
  const fullscreenRef = useRef(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [precise, setPrecise] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [librarySort, setLibrarySort] = useState<ClipSort>("recent");
  const [libraryThumbSize, setLibraryThumbSize] = useState(64);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [playablePath, setPlayablePath] = useState<string | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [ffmpegOk, setFfmpegOk] = useState(true);
  const [marks, setMarks] = useState<Marks>({ a: null, b: null });
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<VideoRect | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; path?: string } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [subs, setSubs] = useState<{ label: string; vtt: string; cues: Cue[] } | null>(null);
  const [delay, setDelay] = useState(0);
  const [cueStyle, setCueStyle] = useState<CueStyle>(defaultCueStyle);
  const [subtitleLanguage, setSubtitleLanguage] = useState("rum");
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [dropHint, setDropHint] = useState<"subtitle" | "video" | null>(null);
  const dragDepth = useRef(0);
  const noticeTimer = useRef<number | null>(null);
  const [overlayShortcut, setOverlayShortcut] = useState("Ctrl+Alt+L");
  const [vaultShortcut, setVaultShortcut] = useState("Ctrl+Alt+Shift+V");
  const [launchOnStartup, setLaunchOnStartup] = useState(false);
  const [cursorSize, setCursorSize] = useState(24);
  const [exportDirectory, setExportDirectory] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [hubPage, setHubPage] = useState<"home" | "settings" | "vault" | "replay" | "studio">("home");
  const [studioSeed, setStudioSeed] = useState<StudioSeed | null>(null);
  const [fromVault, setFromVault] = useState(false);
  const [vaultTitle, setVaultTitle] = useState<string | null>(null);
  const [lastFolder, setLastFolder] = useState<string | null>(null);
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [lumenFolders, setLumenFolders] = useState<LumenFolder[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [home, setHome] = useState(true);
  const homeRef = useRef(true);
  const vaultPlayback = useRef(false);
  const vaultName = useRef<string | null>(null);
  const vaultReturn = useRef<"home" | "player">("home");
  homeRef.current = home;
  const [osd, showOsd] = useOsd();
  const chrome = useChromeFade(playing && !menuOpen && !scrubbing);
  const interactionRef = useRef({ editorOpen, menuOpen });
  interactionRef.current = { editorOpen, menuOpen };
  const cursorIdle = useIdleCursor();
  const { posters, request } = usePosters(items);

  const durationOf = (): number => {
    const media = videoRef.current?.duration;
    if (media && Number.isFinite(media)) return media;
    return duration;
  };

  async function showFolder(folder: string, playFirst: boolean): Promise<void> {
    if (vaultPlayback.current) await releaseVaultPlayback();
    setEditorOpen(false);
    const listing = await window.lumen.listDirectory(folder);
    setItems(listing.items);
    setLastFolder(listing.folder);
    setRecentFolders((await window.lumen.getSettings()).recentFolders);
    setHome(false);
    const stillHere = listing.items.some((item) => item.path === currentPath);
    if (!stillHere) {
      videoRef.current && pausePlayback(videoRef.current);
      setPlaying(false);
      setCurrentPath(null);
      setPlayablePath(null);
      setBanner(null);
      window.lumen.setTitle("Lumen");
    }
    if (playFirst && !currentPath && listing.items[0]) await loadFile(listing.items[0].path);
  }

  async function openFolder(playFirst: boolean): Promise<void> {
    const folder = await window.lumen.openFolder();
    if (!folder) return;
    await showFolder(folder, playFirst);
  }

  async function releaseVaultPlayback(): Promise<void> {
    if (!vaultPlayback.current) return;
    const video = videoRef.current;
    video && pausePlayback(video);
    video?.removeAttribute("src");
    video?.load();
    vaultPlayback.current = false;
    vaultName.current = null;
    setFromVault(false);
    setVaultTitle(null);
    setCurrentPath(null);
    setPlayablePath(null);
    await window.lumen.vaultLock();
  }

  function leaveVault(): void {
    const backToPlayer = vaultReturn.current === "player" && Boolean(currentPath);
    if (backToPlayer && vaultPlayback.current) {
      setHubPage("home");
      setHome(false);
      const title = vaultName.current ?? fileName(currentPath ?? "");
      window.lumen.setTitle(`${title} — Lumen`);
      return;
    }
    if (vaultPlayback.current) void releaseVaultPlayback();
    else void window.lumen.vaultLock();
    setHubPage("home");
    if (backToPlayer && currentPath) {
      setHome(false);
      window.lumen.setTitle(`${fileName(currentPath)} — Lumen`);
      return;
    }
    setHome(true);
    window.lumen.setTitle("Lumen");
  }

  function returnToVault(): void {
    vaultReturn.current = "home";
    const video = videoRef.current;
    video && pausePlayback(video);
    video?.removeAttribute("src");
    video?.load();
    setPlaying(false);
    setPlayablePath(null);
    if (fullscreenRef.current) window.lumen.toggleFullscreen();
    setHubPage("vault");
    setHome(true);
    window.lumen.setTitle("Lumen");
  }

  function goHome(): void {
    videoRef.current && pausePlayback(videoRef.current);
    setPlaying(false);
    setEditorOpen(false);
    if (fullscreenRef.current) window.lumen.toggleFullscreen();
    void releaseVaultPlayback();
    setHubPage("home");
    setHome(true);
    window.lumen.setTitle("Lumen");
  }

  homeFn.current = goHome;

  async function loadFile(filePath: string): Promise<void> {
    const generation = ++mediaGeneration.current;
    previewFallback.current = false;
    setPreparing(true);
    videoRef.current && pausePlayback(videoRef.current);
    setPlayablePath(null);
    try {
      if (vaultPlayback.current) await releaseVaultPlayback();
      const listing = await window.lumen.listFolder(filePath);
      if (generation !== mediaGeneration.current) return;
      setItems(listing.items);
      setLastFolder(listing.folder);
      setRecentFolders((await window.lumen.getSettings()).recentFolders);
      setCurrentPath(filePath);
      setHome(false);
      setMarks({ a: null, b: null });
      setCropMode(false);
      setCropRect(null);
      setAspect(null);
      setFrame(null);
      setDuration(0);
      setCurrentTime(0);
      setPlaying(false);
      setBanner(null);
      setSubs(null);
      setDelay(0);
      window.lumen.setTitle(`${fileName(filePath)} — Lumen`);
      const prepared = await window.lumen.prepare(filePath);
      if (generation !== mediaGeneration.current) return;
      setProbe(prepared.probe);
      setFfmpegOk(prepared.ffmpegOk);
      setPlayablePath(prepared.playablePath);
      if (prepared.probe.duration) setDuration(prepared.probe.duration);
      if (prepared.probe.width && prepared.probe.height) {
        setFrame({ width: prepared.probe.width, height: prepared.probe.height });
      }
      if (!prepared.playablePath) {
        previewFallback.current = true;
        setBanner("Preparing a compatible preview…");
        const proxy = prepared.ffmpegOk ? await window.lumen.preview(filePath) : null;
        if (generation !== mediaGeneration.current) return;
        if (proxy) {
          setPlayablePath(proxy);
          setBanner(null);
        } else {
          setBanner(unplayable);
        }
      }
    } catch (error) {
      if (generation !== mediaGeneration.current) return;
      const message = error instanceof Error ? error.message : "File not found";
      setBanner(message);
    } finally {
      if (generation === mediaGeneration.current) setPreparing(false);
    }
  }

  async function playVault(item: VaultItem): Promise<void> {
    const generation = ++mediaGeneration.current;
    previewFallback.current = false;
    try {
      const filePath = await window.lumen.vaultOpen(item.id);
      vaultPlayback.current = true;
      vaultName.current = item.name;
      setFromVault(true);
      setVaultTitle(item.name);
      setItems([]);
      setFolderOpen(false);
      setHubPage("home");
      setCurrentPath(filePath);
      setHome(false);
      setMarks({ a: null, b: null });
      setCropMode(false);
      setCropRect(null);
      setAspect(null);
      setFrame(null);
      setDuration(0);
      setCurrentTime(0);
      setPlaying(false);
      setBanner(null);
      setSubs(null);
      setDelay(0);
      window.lumen.setTitle(`${item.name} — Lumen`);
      const prepared = await window.lumen.prepare(filePath);
      if (generation !== mediaGeneration.current) return;
      setProbe(prepared.probe);
      setFfmpegOk(prepared.ffmpegOk);
      setPlayablePath(prepared.playablePath);
      if (prepared.probe.duration) setDuration(prepared.probe.duration);
      if (prepared.probe.width && prepared.probe.height) {
        setFrame({ width: prepared.probe.width, height: prepared.probe.height });
      }
      if (!prepared.playablePath) setBanner(unplayable);
    } catch (error) {
      vaultPlayback.current = false;
      vaultName.current = null;
      setFromVault(false);
      setVaultTitle(null);
      setBanner(error instanceof Error ? error.message : "Could not open it");
      setHome(true);
      setHubPage("vault");
    }
  }

  const loadRef = useRef(loadFile);
  loadRef.current = loadFile;
  const sortedItems = useMemo(() => sortClips(items, librarySort), [items, librarySort]);
  const selection = useClipSelection(sortedItems.map((item) => item.path));

  async function removeSelected(): Promise<void> {
    const paths = selection.selected;
    if (paths.length === 0) return;
    const video = videoRef.current;
    if (video && currentPath && paths.includes(currentPath)) {
      pausePlayback(video);
      video.removeAttribute("src");
      video.load();
      setPlayablePath(null);
      setPlaying(false);
    }
    setConfirmDelete(false);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    try {
      const result = await window.lumen.deleteClips(paths);
      if (result.deleted.length > 0) {
        void window.lumen.forgetFavorites(result.deleted).then(setFavorites);
      }
      const gone = new Set(result.deleted);
      selection.clear();
      const rest = items.filter((item) => !gone.has(item.path));
      setItems(rest);
      if (currentPath && gone.has(currentPath)) {
        setCurrentPath(null);
        setPlayablePath(null);
        window.lumen.setTitle("Lumen");
      }
      if (result.failed.length > 0) {
        setBanner(
          `${result.failed.length} clip${result.failed.length === 1 ? "" : "s"} could not be deleted`,
        );
      }
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Delete failed");
    }
  }

  function seekBy(direction: -1 | 1, fine: boolean): void {
    const dur = durationOf();
    const now = videoRef.current?.currentTime ?? currentTime;
    const next = applySeek(now, dur, direction, fine ? 1 : undefined);
    if (next === null) return;
    if (videoRef.current) videoRef.current.currentTime = next;
    setCurrentTime(next);
    showOsd(`${seekLabel(dur, direction, fine)}  ${formatClock(next)}`);
  }

  function seekTo(time: number): void {
    const dur = durationOf();
    if (!Number.isFinite(dur) || dur <= 0) return;
    const next = Math.min(dur, Math.max(0, time));
    if (videoRef.current) videoRef.current.currentTime = next;
    setCurrentTime(next);
  }

  function changeVolume(next: number): void {
    const value = clampVolume(next);
    setVolume(value);
    if (videoRef.current) videoRef.current.volume = value;
    void window.lumen.setSettings({ volume: value });
    showOsd(`Volume ${Math.round(value * 100)}%`);
  }

  function togglePlay(): void {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      resumePlayback(video, () => showOsd("Playback could not resume. Reopen this clip."));
      showOsd("Playing");
    } else {
      pausePlayback(video);
      showOsd("Paused");
    }
  }

  function toggleLoop(): void {
    const next = !loop;
    setLoop(next);
    void window.lumen.setSettings({ loop: next });
    showOsd(next ? "Loop on" : "Loop off");
  }

  function putMark(which: "a" | "b", time?: number): void {
    const dur = durationOf();
    if (!Number.isFinite(dur) || dur <= 0) return;
    const at = time ?? videoRef.current?.currentTime ?? currentTime;
    setMarks(setMark(marks, which, at, dur));
    if (time === undefined) showOsd(which === "a" ? "A set" : "B set");
  }

  function stepClip(direction: -1 | 1): void {
    if (!currentPath) return;
    const index = sortedItems.findIndex((item) => item.path === currentPath);
    if (index < 0) return;
    const move = siblingIndex(sortedItems.length, index, direction);
    if ("edge" in move) {
      showOsd(move.edge === "first" ? "First clip" : "Last clip");
      return;
    }
    const next = sortedItems[move.index];
    if (!next) return;
    showOsd(next.name);
    void loadFile(next.path);
  }

  function toggleFolder(): void {
    const next = !folderOpen;
    setFolderOpen(next);
    void window.lumen.setSettings({ libraryPinned: next });
  }

  function toggleCrop(): void {
    if (cropMode) {
      setCropMode(false);
      setCropRect(null);
      setAspect(null);
      return;
    }
    if (!frame) {
      showOsd("Video size isn't ready");
      return;
    }
    setCropMode(true);
    setCropRect(defaultCrop(frame.width, frame.height));
    setAspect(null);
  }

  function clearSegment(): void {
    setMarks({ a: null, b: null });
    showOsd("Segment cleared");
  }

  function onEscape(): void {
    if (jobRef.current) return;
    if (fullscreenRef.current) {
      window.lumen.toggleFullscreen();
      return;
    }
    if (cropMode) {
      setCropMode(false);
      setCropRect(null);
      setAspect(null);
      return;
    }
    setMarks({ a: null, b: null });
    showOsd("Segment cleared");
  }

  async function exportClip(): Promise<void> {
    if (!currentPath || jobRef.current || !ffmpegOk) return;
    const hasMarks = marks.a !== null && marks.b !== null;
    if (!cropMode && !hasMarks) return;
    if (cropMode && !cropRect) return;
    const dur = durationOf();
    if (!Number.isFinite(dur) || dur <= 0) return;
    try {
      const exact = cropMode
        || precise
        || (hasMarks && !requiresStreamCopy(probe?.videoCodec ?? null));
      const outputPath = await window.lumen.chooseExportPath(currentPath, exact ? "edit" : "trim");
      if (!outputPath) return;
      const result = await window.lumen.startExport({
        sourcePath: currentPath,
        start: hasMarks ? marks.a : null,
        end: hasMarks ? marks.b : null,
        duration: dur,
        precise: exact,
        crop: cropMode ? cropRect : null,
        hasAudio: probe?.audioCodec != null,
        volume: volumeRef.current,
        outputPath,
      });
      jobRef.current = result.jobId;
      setJobId(result.jobId);
      setProgress(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      setToast({ text: message });
    }
  }

  const latest = useRef({
    seekBy,
    changeVolume,
    togglePlay,
    toggleLoop,
    putMark,
    stepClip,
    toggleFolder,
    toggleCrop,
    onEscape,
    exportClip,
    seekTo,
    clearSegment,
  });
  latest.current = {
    seekBy,
    changeVolume,
    togglePlay,
    toggleLoop,
    putMark,
    stepClip,
    toggleFolder,
    toggleCrop,
    onEscape,
    exportClip,
    seekTo,
    clearSegment,
  };

  useEffect(() => {
    void window.lumen.lumenFolders().then(setLumenFolders).catch(() => setLumenFolders([]));
    void window.lumen.favorites().then(setFavorites).catch(() => setFavorites([]));
    const offFolders = window.lumen.onLumenFolders(() => {
      void window.lumen.lumenFolders().then(setLumenFolders).catch(() => undefined);
    });
    const offFavorites = window.lumen.onFavorites(setFavorites);
    return () => {
      offFolders();
      offFavorites();
    };
  }, []);

  useEffect(() => {
    if (!window.lumen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (homeRef.current) return;
      // The studio and open popovers own their keyboard interactions.
      if (interactionRef.current.editorOpen || interactionRef.current.menuOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (event.key === "Escape" && target.closest(".folder")?.querySelector('.folder-switch[aria-expanded="true"]')) return;
        if (event.key !== "Escape" && target.closest("button, input, select, textarea, [role=slider], [contenteditable=true]")) return;
      }
      const action = keyAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        target:
          event.target instanceof HTMLElement
            ? {
                tagName: event.target.tagName,
                isContentEditable: event.target.isContentEditable,
                inputType:
                  event.target instanceof HTMLInputElement ? event.target.type : undefined,
              }
            : null,
      });
      if (!action) return;
      event.preventDefault();
      const api = latest.current;
      switch (action.type) {
        case "seek":
          api.seekBy(action.direction, action.fine);
          break;
        case "volume":
          api.changeVolume(
            stepVolume(videoRef.current?.volume ?? volumeRef.current, action.direction),
          );
          break;
        case "sibling":
          api.stepClip(action.direction);
          break;
        case "toggle-play":
          api.togglePlay();
          break;
        case "toggle-loop":
          api.toggleLoop();
          break;
        case "fullscreen":
          window.lumen.toggleFullscreen();
          break;
        case "folder":
          api.toggleFolder();
          break;
        case "escape":
          api.onEscape();
          break;
        case "home":
          api.seekTo(0);
          break;
        case "end":
          api.seekTo(durationOf());
          break;
        case "zoom":
          stageRef.current?.zoomBy(action.direction);
          break;
        case "zoom-reset":
          stageRef.current?.resetZoom();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (!window.lumen) return;
    void window.lumen.getSettings().then((settings) => {
      setVolume(settings.volume);
      setLoop(settings.loop);
      setPrecise(settings.preciseTrim);
      setFolderOpen(settings.libraryPinned);
      setOverlayShortcut(settings.overlayAccelerator);
      setVaultShortcut(settings.vaultAccelerator);
      setLaunchOnStartup(settings.launchOnStartup);
      setCursorSize(settings.cursorSize);
      setExportDirectory(settings.exportDirectory);
      setLastFolder(settings.lastFolder);
      setRecentFolders(settings.recentFolders);
      setCueStyle(settings.cueStyle);
      setSubtitleLanguage(settings.subtitleLanguage);
    });
    void window.lumen.initialFile().then((file) => {
      if (file) void loadRef.current(file);
    });
    const offOpen = window.lumen.onOpenFile((file) => {
      void loadRef.current(file);
    });
    const offHidden = window.lumen.onPlayerHidden(() => {
      videoRef.current && pausePlayback(videoRef.current);
    });
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") videoRef.current && pausePlayback(videoRef.current);
    };
    document.addEventListener("visibilitychange", onVisibility);
    const offProgress = window.lumen.onExportProgress((payload) => {
      if (jobRef.current !== payload.jobId) return;
      setProgress(payload.ratio);
    });
    const offDone = window.lumen.onExportDone((payload) => {
      if (jobRef.current !== payload.jobId) return;
      jobRef.current = null;
      setJobId(null);
      setProgress(null);
      setToast({ text: fileName(payload.outputPath), path: payload.outputPath });
    });
    const offHome = window.lumen.onShowHome(() => homeFn.current());
    const offStudio = window.lumen.onStudioOpen((filePath) => {
      videoRef.current && pausePlayback(videoRef.current);
      setPlaying(false);
      setEditorOpen(false);
      setHome(true);
      setHubPage("studio");
      if (filePath) setStudioSeed({ path: filePath, token: Date.now() });
      window.lumen.setTitle("Lumen");
    });
    const offVault = window.lumen.onVaultOpen(() => {
      vaultReturn.current = homeRef.current ? "home" : "player";
      videoRef.current && pausePlayback(videoRef.current);
      setPlaying(false);
      setHubPage("vault");
      setHome(true);
      window.lumen.setTitle("Lumen");
    });
    const offFullscreen = window.lumen.onFullscreen((active) => {
      setFullscreen(active);
      showOsd(active ? "Fullscreen · Esc to return" : "Window view");
    });
    const offError = window.lumen.onExportError((payload) => {
      if (jobRef.current !== payload.jobId) return;
      jobRef.current = null;
      setJobId(null);
      setProgress(null);
      setToast({ text: payload.message });
    });
    return () => {
      offOpen();
      offHidden();
      document.removeEventListener("visibilitychange", onVisibility);
      offProgress();
      offDone();
      offFullscreen();
      offError();
      offVault();
      offHome();
      offStudio();
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume, playablePath]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate, playablePath]);

  volumeRef.current = volume;
  fullscreenRef.current = fullscreen;
  const segment = marks.a !== null && marks.b !== null;
  const canExport = Boolean(
    currentPath &&
      ffmpegOk &&
      !jobId &&
      durationOf() > 0 &&
      (cropMode ? cropRect : segment),
  );
  const exportHint = !ffmpegOk ? "ffmpeg is not available" : null;

  function showNotice(text: string): void {
    setNotice(text);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 4200);
  }

  function acceptSubtitles(vtt: string, label: string): void {
    const cues = parseVtt(vtt);
    if (cues.length === 0) {
      showNotice("That subtitle file has no lines");
      return;
    }
    setSubs({ label, vtt, cues });
    setDelay(0);
    showNotice(`Subtitles loaded · ${label}`);
  }

  function dragKind(transfer: DataTransfer): "video" | "subtitle" | null {
    const file = transfer.files[0];
    if (!file) return null;
    const name = file.name.toLowerCase();
    if (name.endsWith(".srt") || name.endsWith(".vtt")) return "subtitle";
    if (isVideoName(name)) return "video";
    return null;
  }

  function onDragEnter(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepth.current += 1;
    const kind = dragKind(event.dataTransfer);
    if (kind) setDropHint(kind);
  }

  function onDragOver(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const kind = dragKind(event.dataTransfer);
    if (!kind && !event.dataTransfer.types.includes("Files")) return;
    event.dataTransfer.dropEffect = "copy";
    if (kind) setDropHint(kind);
    else setDropHint("subtitle");
  }

  function onDragLeave(): void {
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDropHint(null);
    }
  }

  async function syncAudio(): Promise<void> {
    if (!currentPath || !subs) return;
    setSyncing(true);
    showNotice("Listening to the audio…");
    try {
      const offset = await window.lumen.syncSubtitles(currentPath, subs.vtt, durationOf());
      setDelay(offset);
      const sign = offset > 0 ? "+" : "";
      showNotice(
        Math.abs(offset) < 0.15
          ? "Audio already lines up"
          : `Synced to audio · ${sign}${offset.toFixed(1)}s`,
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepth.current = 0;
    setDropHint(null);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const filePath = window.lumen.pathForFile(file);
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".srt") || lower.endsWith(".vtt")) {
      void window.lumen.readSubtitle(filePath).then(
        (read) => acceptSubtitles(read.vtt, read.label),
        (error: unknown) => {
          showNotice(error instanceof Error ? error.message : "Subtitle file failed");
        },
      );
      return;
    }
    if (!isVideoName(filePath)) {
      showNotice("Drop a video, or a .srt / .vtt subtitle");
      return;
    }
    void loadFile(filePath);
  }

  const shellClass = [
    "shell",
    fullscreen ? "is-fullscreen" : "",
    home ? "is-home" : "",
    home || chrome || !playing ? "" : "is-cinema",
    folderOpen ? "is-library-pinned" : "",
    cursorIdle ? "is-cursor-idle" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={shellClass}
      style={{
        "--cursor-size": `${cursorSize}px`,
        "--lumen-cursor": lumenCursor(cursorSize),
      } as CSSProperties}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <UpdateBanner />
      {home && hubPage === "studio" ? (
        <StudioBoard seed={studioSeed} onBack={() => setHubPage("home")} />
      ) : null}
      {home && hubPage === "vault" ? (
        <VaultPane
          onPlay={(item) => void playVault(item)}
          onLock={leaveVault}
          onMinimize={() => window.lumen.minimize()}
          onMaximize={() => window.lumen.toggleMaximize()}
          onClose={() => window.lumen.close()}
        />
      ) : null}
      {home && hubPage !== "vault" && hubPage !== "studio" ? (
        <Hub
          page={hubPage === "settings" || hubPage === "replay" ? hubPage : "home"}
          shortcut={overlayShortcut}
          vaultShortcut={vaultShortcut}
          launchOnStartup={launchOnStartup}
          cursorSize={cursorSize}
          onCursorSize={(size) => {
            setCursorSize(size);
            void window.lumen.setSettings({ cursorSize: size });
          }}
          exportDirectory={exportDirectory}
          onExportDirectory={() => {
            void window.lumen.openFolder().then((folder) => {
              if (!folder) return;
              setExportDirectory(folder);
              void window.lumen.setSettings({ exportDirectory: folder });
            });
          }}
          folderName={lastFolder ? folderLabel(lastFolder) : null}
          dropping={dropHint === "video"}
          onOpenFile={() => {
            void window.lumen.openFile().then((file) => {
              if (file) void loadFile(file);
            });
          }}
          onOpenEditor={() => {
            setEditorOpen(false);
            setHubPage("studio");
          }}
          onViewActivity={(file) => { void loadFile(file); }}
          onOpenLibrary={() => {
            if (lastFolder) void showFolder(lastFolder, false);
            else void openFolder(false);
          }}
          onOverlay={() => window.lumen.toggleOverlay()}
          onOpenSettings={() => setHubPage("settings")}
          onOpenReplay={() => setHubPage("replay")}
          onOpenVault={() => setHubPage("vault")}
          onBack={() => setHubPage("home")}
          onShortcut={async (which, accelerator) => {
            const settings =
              which === "overlay"
                ? await window.lumen.setOverlayShortcut(accelerator)
                : await window.lumen.setVaultShortcut(accelerator);
            setOverlayShortcut(settings.overlayAccelerator);
            setVaultShortcut(settings.vaultAccelerator);
          }}
          onLaunch={async (enabled) => {
            const settings = await window.lumen.setLaunchOnStartup(enabled);
            setLaunchOnStartup(settings.launchOnStartup);
          }}
          onMinimize={() => window.lumen.minimize()}
          onMaximize={() => window.lumen.toggleMaximize()}
          onClose={() => window.lumen.close()}
        />
      ) : null}
      <TitleBar
        fileLabel={
          fromVault && vaultTitle ? vaultTitle : currentPath ? fileName(currentPath) : "Lumen"
        }
        onHome={goHome}
        onEdit={() => setEditorOpen((value) => {
          const next = !value;
          if (next) videoRef.current && pausePlayback(videoRef.current);
          return next;
        })}
        editing={editorOpen && !home}
        canEdit={Boolean(!home && currentPath && !fromVault)}
        onMinimize={() => window.lumen.minimize()}
        onMaximize={() => window.lumen.toggleMaximize()}
        onClose={() => window.lumen.close()}
      />
      {!home && editorOpen && currentPath ? (
        <section className="editor-page">
          <header className="editor-heading">
            <div>
              <span className="editor-eyebrow">LUMEN STUDIO · CLIP EDITOR</span>
              <h1>Shape the moment.</h1>
              <p>Trim with precision. Compress with confidence. Export when it feels right.</p>
            </div>
            <button type="button" className="editor-close" onClick={() => setEditorOpen(false)}>Back to watching</button>
          </header>
          <OverlayDetail
            item={items.find((item) => item.path === currentPath) ?? {
              path: currentPath,
              name: fileName(currentPath),
              mtimeMs: Date.now(),
              sizeBytes: 0,
            }}
            volume={volume}
            busy={jobId !== null}
            progress={progress}
            onBack={() => setEditorOpen(false)}
            onVolume={changeVolume}
            onExport={(request) => {
              void (async () => {
                if (jobRef.current) return;
                const outputPath = await window.lumen.chooseExportPath(request.sourcePath, request.precise ? "edit" : "trim");
                if (!outputPath) return;
                try {
                  const result = await window.lumen.startExport({ ...request, outputPath });
                  jobRef.current = result.jobId;
                  setJobId(result.jobId);
                  setProgress(0);
                } catch (error) {
                  setToast({ text: error instanceof Error ? error.message : "Export failed" });
                }
              })();
            }}
            status={notice}
            onCancel={() => {
              if (!jobId) return;
              void window.lumen.cancelExport(jobId);
              jobRef.current = null;
              setJobId(null);
              setProgress(null);
            }}
          />
        </section>
      ) : (
      <div className="workspace">
        <FolderList
          items={sortedItems}
          folderName={lastFolder ? folderLabel(lastFolder) : null}
          recentFolders={recentFolders}
          currentPath={currentPath}
          posters={posters}
          selected={selection.selected}
          sort={librarySort}
          thumbSize={libraryThumbSize}
          pinned={folderOpen}
          onSort={setLibrarySort}
          onThumbSize={setLibraryThumbSize}
          onTogglePinned={toggleFolder}
          onVisible={request}
          onChangeFolder={() => void openFolder(false)}
          onSelectFolder={(folder) => void showFolder(folder, false)}
          onOpen={(file) => void loadFile(file)}
          onEdit={(file) => { void loadFile(file).then(() => setEditorOpen(true)); }}
          onStudio={(file) => { void window.lumen.openStudio(file); }}
          onSelect={selection.pick}
          lumenFolders={lumenFolders}
          folderPath={lastFolder}
          favorites={favorites}
          onFavorite={(filePath) => {
            void window.lumen.toggleFavorite(filePath).then(setFavorites).catch(() => undefined);
          }}
          deleteSlot={
            <DeleteClips
              count={selection.selected.length}
              pending={confirmDelete}
              onAsk={() => setConfirmDelete(true)}
              onConfirm={() => void removeSelected()}
              onCancel={() => setConfirmDelete(false)}
            />
          }
        />
        <div className="stage">
          {currentPath ? <div className="stage-meta" aria-hidden="true"><span><i className={playing ? "is-playing" : ""} />{playing ? "NOW PLAYING" : "READY TO PLAY"}</span><span>{frame ? `${frame.width} × ${frame.height}` : "LOADING"}{rate !== 1 ? ` / ${rate}×` : ""}</span></div> : null}
          {fromVault ? (
            <button type="button" className="vault-return" onClick={returnToVault}>
              Vault
            </button>
          ) : null}
          <VideoStage
            ref={stageRef}
            playablePath={playablePath}
            preparing={preparing}
            volume={volume}
            loopWhole={loop}
            segment={segment}
            marks={marks}
            scrubbing={scrubbing}
            osd={osd}
            banner={banner}
            empty={!currentPath}
            cropMode={cropMode}
            cropRect={cropRect}
            frame={frame}
            aspect={aspect}
            onCrop={setCropRect}
            onAspect={setAspect}
            onTime={setCurrentTime}
            onReady={(nextDuration, nextFrame) => {
              if (Number.isFinite(nextDuration)) setDuration(nextDuration);
              if (nextFrame.width > 0 && nextFrame.height > 0) setFrame(nextFrame);
            }}
            onPlaying={setPlaying}
            playing={playing}
            rate={rate}
            onTogglePlay={togglePlay}
            onFullscreen={() => window.lumen.toggleFullscreen()}
            onError={() => {
              const source = currentPath;
              const generation = mediaGeneration.current;
              if (!source || fromVault || previewFallback.current) {
                setPlayablePath(null);
                setBanner(unplayable);
                return;
              }
              previewFallback.current = true;
              setBanner("Preparing a compatible preview…");
              void window.lumen.preview(source).then((proxy) => {
                if (generation !== mediaGeneration.current) return;
                if (proxy) {
                  setPlayablePath(proxy);
                  setBanner(null);
                } else {
                  setPlayablePath(null);
                  setBanner(unplayable);
                }
              }).catch(() => {
                if (generation !== mediaGeneration.current) return;
                setPlayablePath(null);
                setBanner(unplayable);
              });
            }}
            onOpen={() => {
              void window.lumen.openFile().then((file) => {
                if (file) void loadFile(file);
              });
            }}
            cueText={subs ? cueAt(subs.cues, currentTime, delay) : null}
            cueStyle={cueStyle}
            dropHint={dropHint}
            notice={notice}
            videoRef={videoRef}
          />
          <div className="player-chrome">
            <Timeline
              duration={duration}
              current={currentTime}
              marks={marks}
              previewPath={playablePath}
              onSeek={seekTo}
              onScrubbing={setScrubbing}
              onMark={(which, time) => putMark(which, time)}
            />
            <Transport
            onShowInFolder={currentPath && !fromVault ? () => { void window.lumen.showItem(currentPath).catch(() => showNotice('Could not show this file in its folder.')); } : undefined}
            fullscreen={fullscreen}
            available={Boolean(playablePath) && !preparing}
            onPrevious={() => stepClip(-1)}
            onNext={() => stepClip(1)}
            hasPrevious={sortedItems.findIndex((item) => item.path === currentPath) > 0}
            hasNext={Boolean(currentPath) && sortedItems.findIndex((item) => item.path === currentPath) >= 0 && sortedItems.findIndex((item) => item.path === currentPath) < sortedItems.length - 1}
            playing={playing}
            current={currentTime}
            duration={duration}
            volume={volume}
            canExport={canExport}
            exportHint={!ffmpegOk ? "ffmpeg is not available" : exportHint}
            fastTrim={canExport && !cropMode && !precise}
            progress={jobId ? progress : null}
            segmentLoop={segment}
            canClear={marks.a !== null || marks.b !== null}
            fileLabel={
              fromVault && vaultTitle
                ? vaultTitle
                : currentPath
                  ? fileName(currentPath)
                  : "No video"
            }
            loop={loop}
            precise={precise}
            cropMode={cropMode}
            overlayShortcut={overlayShortcut}
            loadedLabel={subs?.label ?? null}
            language={subtitleLanguage}
            delay={delay}
            syncing={syncing}
            canSync={Boolean(currentPath && subs && ffmpegOk)}
            cueStyle={cueStyle}
            onTogglePlay={togglePlay}
            onVolume={changeVolume}
            onExport={() => void exportClip()}
            onMarkIn={() => putMark("a")}
            onMarkOut={() => putMark("b")}
            onClearSegment={clearSegment}
            onToggleLoop={toggleLoop}
            onTogglePrecise={() => {
              if (cropMode) return;
              const next = !precise;
              setPrecise(next);
              void window.lumen.setSettings({ preciseTrim: next });
            }}
            onToggleCrop={toggleCrop}
            onDefaultApps={() => {
              void window.lumen.openDefaultApps();
            }}
            onSubtitles={acceptSubtitles}
            onClearSubs={() => {
              setSubs(null);
              setDelay(0);
              showNotice("Subtitles off");
            }}
            onDelay={setDelay}
            onSync={() => void syncAudio()}
            onStyle={(next) => {
              setCueStyle(next);
              void window.lumen.setSettings({ cueStyle: next });
            }}
            onLanguage={(language) => {
              const next = language === "eng" ? "eng" : "rum";
              setSubtitleLanguage(next);
              void window.lumen.setSettings({ subtitleLanguage: next });
            }}
            onMenu={setMenuOpen}
            onFullscreen={() => window.lumen.toggleFullscreen()}
            rate={rate}
            onRate={setRate}
            editorMode={false}
            onCancel={() => {
              if (!jobId) return;
              void window.lumen.cancelExport(jobId);
              jobRef.current = null;
              setJobId(null);
              setProgress(null);
            }}
          />
          </div>
        </div>
      </div>
      )}
      {hasToast(toast) ? (
        <div className="toast">
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

function folderLabel(folder: string): string {
  const parts = folder.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? folder;
}

function hasToast(toast: { text: string; path?: string } | null): toast is { text: string; path?: string } {
  return toast !== null;
}
