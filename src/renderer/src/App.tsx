import { useEffect, useRef, useState } from "react";
import type { FolderItem } from "@shared/contracts";
import type { VideoRect } from "@shared/crop";
import { defaultCrop } from "@shared/crop";
import { isVideoName, siblingIndex } from "@shared/library";
import { keyAction } from "@shared/keyboard";
import type { Probe } from "@shared/probe";
import { setMark, type Marks } from "@shared/range";
import { applySeek } from "@shared/seek";
import { clampVolume, stepVolume } from "@shared/volume";
import { DeleteClips } from "./components/DeleteClips";
import { FolderList } from "./components/FolderList";
import { Timeline } from "./components/Timeline";
import { TitleBar } from "./components/TitleBar";
import { Transport } from "./components/Transport";
import { VideoStage, type VideoStageHandle } from "./components/VideoStage";
import { fileName, formatClock, seekLabel, useChromeFade, useOsd } from "./player/usePlayback";
import { useClipSelection } from "./player/useSelection";

const unplayable = "This clip can't be played. You can still export it if ffmpeg can read it.";

type Frame = { width: number; height: number };

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<VideoStageHandle>(null);
  const thumbToken = useRef(0);
  const jobRef = useRef<string | null>(null);
  const volumeRef = useRef(1);
  const fullscreenRef = useRef(false);
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [precise, setPrecise] = useState(false);
  const [folderOpen, setFolderOpen] = useState(true);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [playablePath, setPlayablePath] = useState<string | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [ffmpegOk, setFfmpegOk] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState<Marks>({ a: null, b: null });
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<VideoRect | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; path?: string } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [overlayShortcut, setOverlayShortcut] = useState("Ctrl+Alt+L");
  const [osd, showOsd] = useOsd();
  const chrome = useChromeFade(playing);

  const durationOf = (): number => {
    const media = videoRef.current?.duration;
    if (media && Number.isFinite(media)) return media;
    return duration;
  };

  async function loadThumbs(list: FolderItem[], token: number): Promise<void> {
    for (const item of list) {
      if (thumbToken.current !== token) return;
      const image = await window.lumen.thumbnail(item.path, null);
      if (thumbToken.current !== token || !image) continue;
      setThumbs((prev) => ({ ...prev, [item.path]: image }));
    }
  }

  async function loadFile(filePath: string): Promise<void> {
    try {
      const listing = await window.lumen.listFolder(filePath);
      const token = thumbToken.current + 1;
      thumbToken.current = token;
      setItems(listing.items);
      setCurrentPath(filePath);
      setMarks({ a: null, b: null });
      setCropMode(false);
      setCropRect(null);
      setAspect(null);
      setFrame(null);
      setDuration(0);
      setCurrentTime(0);
      setPlaying(false);
      setBanner(null);
      window.lumen.setTitle(`${fileName(filePath)} — Lumen`);
      const prepared = await window.lumen.prepare(filePath);
      setProbe(prepared.probe);
      setFfmpegOk(prepared.ffmpegOk);
      setPlayablePath(prepared.playablePath);
      if (prepared.probe.duration) setDuration(prepared.probe.duration);
      if (prepared.probe.width && prepared.probe.height) {
        setFrame({ width: prepared.probe.width, height: prepared.probe.height });
      }
      if (!prepared.playablePath) setBanner(unplayable);
      void loadThumbs(listing.items, token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "File not found";
      setBanner(message);
    }
  }

  const loadRef = useRef(loadFile);
  loadRef.current = loadFile;
  const selection = useClipSelection(items.map((item) => item.path));

  async function removeSelected(): Promise<void> {
    const paths = selection.selected;
    if (paths.length === 0) return;
    const video = videoRef.current;
    if (video && currentPath && paths.includes(currentPath)) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      setPlayablePath(null);
      setPlaying(false);
    }
    setConfirmDelete(false);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    try {
      const result = await window.lumen.deleteClips(paths);
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
    if (video.paused) void video.play();
    else video.pause();
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
    const index = items.findIndex((item) => item.path === currentPath);
    if (index < 0) return;
    const move = siblingIndex(items.length, index, direction);
    if ("edge" in move) {
      showOsd(move.edge === "first" ? "First clip" : "Last clip");
      return;
    }
    const next = items[move.index];
    if (!next) return;
    showOsd(next.name);
    void loadFile(next.path);
  }

  function toggleFolder(): void {
    const next = !folderOpen;
    setFolderOpen(next);
    void window.lumen.setSettings({ folderOpen: next });
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
      const result = await window.lumen.startExport({
        sourcePath: currentPath,
        start: hasMarks ? marks.a : null,
        end: hasMarks ? marks.b : null,
        duration: dur,
        precise: cropMode || precise,
        crop: cropMode ? cropRect : null,
        hasAudio: probe?.audioCodec != null,
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
    if (!window.lumen) return;
    const onKey = (event: KeyboardEvent): void => {
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
        case "mark":
          api.putMark(action.which);
          break;
        case "fullscreen":
          window.lumen.toggleFullscreen();
          break;
        case "folder":
          api.toggleFolder();
          break;
        case "crop":
          api.toggleCrop();
          break;
        case "export":
          void api.exportClip();
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
      setFolderOpen(settings.folderOpen);
      setOverlayShortcut(settings.overlayAccelerator);
    });
    void window.lumen.initialFile().then((file) => {
      if (file) void loadRef.current(file);
    });
    const offOpen = window.lumen.onOpenFile((file) => {
      void loadRef.current(file);
    });
    const offHidden = window.lumen.onPlayerHidden(() => {
      videoRef.current?.pause();
    });
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") videoRef.current?.pause();
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
    const offFullscreen = window.lumen.onFullscreen(setFullscreen);
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
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume, playablePath]);

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
  const exportHint =
    currentPath && !cropMode && !segment ? "Set in and out with I and O" : null;

  function onDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const filePath = window.lumen.pathForFile(file);
    if (!isVideoName(filePath)) return;
    void loadFile(filePath);
  }

  const shellClass = [
    "shell",
    fullscreen ? "is-fullscreen" : "",
    chrome || !playing ? "" : "is-cinema",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={shellClass}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <TitleBar
        fileLabel={currentPath ? fileName(currentPath) : "No video"}
        onOpen={() => {
          void window.lumen.openFile().then((file) => {
            if (file) void loadFile(file);
          });
        }}
        onOverlay={() => window.lumen.toggleOverlay()}
        overlayShortcut={overlayShortcut}
        onDefaultApps={() => {
          void window.lumen.openDefaultApps();
        }}
        onMinimize={() => window.lumen.minimize()}
        onMaximize={() => window.lumen.toggleMaximize()}
        onClose={() => window.lumen.close()}
      />
      <div className="workspace">
        {folderOpen ? (
          <FolderList
            items={items}
            currentPath={currentPath}
            thumbs={thumbs}
            selected={selection.selected}
            onOpen={(file) => void loadFile(file)}
            onSelect={selection.pick}
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
        ) : null}
        <div className="stage">
          <VideoStage
            ref={stageRef}
            playablePath={playablePath}
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
            onTogglePlay={togglePlay}
            onFullscreen={() => window.lumen.toggleFullscreen()}
            onError={() => {
              setPlayablePath(null);
              setBanner(unplayable);
            }}
            onOpen={() => {
              void window.lumen.openFile().then((file) => {
                if (file) void loadFile(file);
              });
            }}
            videoRef={videoRef}
          />
          <Timeline
            duration={duration}
            current={currentTime}
            marks={marks}
            onSeek={seekTo}
            onScrubbing={setScrubbing}
            onMark={(which, time) => putMark(which, time)}
          />
          <Transport
            playing={playing}
            current={currentTime}
            duration={duration}
            volume={volume}
            loop={loop}
            precise={precise}
            cropMode={cropMode}
            canExport={canExport}
            exportHint={!ffmpegOk ? "ffmpeg is not available" : exportHint}
            fastTrim={canExport && !cropMode && !precise}
            progress={jobId ? progress : null}
            onTogglePlay={togglePlay}
            onVolume={changeVolume}
            onToggleLoop={toggleLoop}
            onMarkIn={() => putMark("a")}
            onMarkOut={() => putMark("b")}
            canClear={marks.a !== null || marks.b !== null}
            segmentLoop={segment}
            onClearSegment={clearSegment}
            onTogglePrecise={() => {
              if (cropMode) return;
              const next = !precise;
              setPrecise(next);
              void window.lumen.setSettings({ preciseTrim: next });
            }}
            onToggleCrop={toggleCrop}
            onExport={() => void exportClip()}
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

function hasToast(toast: { text: string; path?: string } | null): toast is { text: string; path?: string } {
  return toast !== null;
}
