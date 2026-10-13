import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FolderItem, LumenFolder } from "@shared/contracts";
import { containedVideoBox, defaultCrop, type ScreenBox } from "@shared/crop";
import { clipSpan, locateTime, splitClip, type SequenceClip } from "@shared/sequence";
import { clipTitle } from "@shared/clips";
import { formatClock, mediaUrl } from "../player/usePlayback";
import { posterImage, usePosters } from "../player/usePosters";
import { CropOverlay } from "./CropOverlay";
import { Filmstrip } from "./Filmstrip";
import { Icon } from "./Icon";
import { PlaybackGlyph } from "./PlaybackGlyph";
import { Poster } from "./ClipCard";
import { BackButton, WindowControls } from "./WindowChrome";
import { TrimTrack } from "./TrimTrack";
import { VolumeControl } from "./VolumeControl";

export type StudioSeed = { path: string; token: number };

type BoardClip = SequenceClip & { id: string; name: string; duration: number };

function fileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function rulerStep(zoom: number): number {
  const raw = 80 / Math.max(zoom, 1);
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((step) => step >= raw) ?? 600;
}

function rulerLabel(seconds: number, step: number): string {
  if (step >= 1) return formatClock(seconds);
  const tenths = Math.round(seconds * 10) / 10;
  return `${formatClock(Math.floor(tenths))}.${Math.round((tenths % 1) * 10)}`;
}

export function StudioBoard({
  seed,
  onBack,
}: {
  seed: StudioSeed | null;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [folders, setFolders] = useState<LumenFolder[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [media, setMedia] = useState<FolderItem[]>([]);
  const [query, setQuery] = useState("");
  const [clips, setClips] = useState<BoardClip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [cropMode, setCropMode] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);
  const [videoBox, setVideoBox] = useState<ScreenBox | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [zoom, setZoom] = useState(48);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [viewport, setViewport] = useState({ left: 0, width: 800 });
  const jobId = useRef<string | null>(null);
  const seekTo = useRef<number | null>(null);
  const resumePlay = useRef(false);
  const lineRef = useRef<HTMLDivElement>(null);
  const zoomAnchor = useRef<{ time: number; offset: number } | null>(null);
  const press = useRef<{ x: number; y: number; time: number } | null>(null);
  const scrubbing = useRef(false);
  const toggleRef = useRef<() => void>(() => {});
  const selected = clips.find((clip) => clip.id === selectedId) ?? null;
  const posterItems = useMemo(() => {
    const byPath = new Map<string, FolderItem>();
    for (const item of media) byPath.set(item.path, item);
    for (const clip of clips) {
      if (!byPath.has(clip.path)) {
        byPath.set(clip.path, { path: clip.path, name: clip.name, mtimeMs: 0, sizeBytes: 0 });
      }
    }
    return [...byPath.values()];
  }, [media, clips]);
  const { posters } = usePosters(posterItems);
  const total = clips.reduce((sum, clip) => sum + clipSpan(clip), 0);
  const step = rulerStep(zoom);
  const rulerMarks = useMemo(() => {
    const marks: number[] = [];
    for (let mark = 0; mark <= total + 0.001; mark += step) {
      marks.push(Math.round(mark * 1000) / 1000);
    }
    return marks;
  }, [total, step]);

  useEffect(() => {
    void window.lumen.lumenFolders().then(setFolders).catch(() => setFolders([]));
    const off = window.lumen.onLumenFolders(() => {
      void window.lumen.lumenFolders().then(setFolders).catch(() => undefined);
    });
    const offProgress = window.lumen.onExportProgress((payload) => {
      if (jobId.current !== payload.jobId) return;
      setProgress(payload.ratio);
    });
    const offDone = window.lumen.onExportDone((payload) => {
      if (jobId.current !== payload.jobId) return;
      jobId.current = null;
      setBusy(false);
      setProgress(null);
      setNotice(`Saved ${fileName(payload.outputPath)}`);
    });
    const offError = window.lumen.onExportError((payload) => {
      if (jobId.current !== payload.jobId) return;
      jobId.current = null;
      setBusy(false);
      setProgress(null);
      setNotice(payload.message);
    });
    return () => {
      off();
      offProgress();
      offDone();
      offError();
    };
  }, []);

  useEffect(() => {
    if (!folder) return;
    void window.lumen.listDirectory(folder).then((listing) => {
      setMedia(listing.items);
    }).catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "Folder could not be opened");
    });
  }, [folder]);

  useEffect(() => {
    if (!seed?.path) return;
    void addClip(seed.path);
  }, [seed]);

  useEffect(() => {
    const node = lineRef.current;
    if (!node) return;
    const zoomWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const box = node.getBoundingClientRect();
      const offset = event.clientX - box.left;
      const time = (offset + node.scrollLeft) / zoom;
      zoomAnchor.current = { time, offset };
      const factor = event.deltaY > 0 ? 1 / 1.15 : 1.15;
      setZoom((value) => Math.min(480, Math.max(8, value * factor)));
    };
    const read = (): void => setViewport({ left: node.scrollLeft, width: node.clientWidth });
    read();
    node.addEventListener("wheel", zoomWheel, { passive: false });
    node.addEventListener("scroll", read, { passive: true });
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => {
      node.removeEventListener("wheel", zoomWheel);
      node.removeEventListener("scroll", read);
      observer.disconnect();
    };
  }, [zoom, clips.length]);

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const node = lineRef.current;
    if (!anchor || !node) return;
    node.scrollLeft = Math.max(0, anchor.time * zoom - anchor.offset);
    zoomAnchor.current = null;
  }, [zoom]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
      if (event.code === "Space") {
        event.preventDefault();
        toggleRef.current();
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (!selectedId) return;
      event.preventDefault();
      setClips((current) => current.filter((clip) => clip.id !== selectedId));
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selected) return;
    const tick = (): void => {
      const end = selected.end;
      let at = 0;
      for (const clip of clips) {
        if (clip.id === selected.id) break;
        at += clipSpan(clip);
      }
      if (video.currentTime >= end - 0.04) {
        const index = clips.findIndex((clip) => clip.id === selected.id);
        const next = clips[index + 1];
        setCursor(at + clipSpan(selected));
        if (next && !video.paused) {
          resumePlay.current = true;
          seekTo.current = next.start;
          setSelectedId(next.id);
          return;
        }
        video.pause();
        return;
      }
      setTime(video.currentTime);
      setCursor(at + Math.max(0, video.currentTime - selected.start));
    };
    video.addEventListener("timeupdate", tick);
    return () => video.removeEventListener("timeupdate", tick);
  }, [selected, clips]);

  useEffect(() => {
    const node = lineRef.current;
    if (!node || !playing) return;
    const x = cursor * zoom;
    if (x < node.scrollLeft + 48 || x > node.scrollLeft + node.clientWidth - 48) {
      node.scrollLeft = Math.max(0, x - node.clientWidth * 0.3);
    }
  }, [cursor, playing, zoom]);

  async function addClip(filePath: string): Promise<void> {
    try {
      const prepared = await window.lumen.prepare(filePath);
      const probe = prepared.probe;
      const duration = probe.duration ?? 0;
      if (duration <= 0) {
        setNotice("This clip has no duration.");
        return;
      }
      if (clips.length === 0) {
        const width = lineRef.current?.clientWidth ?? 960;
        setZoom(Math.min(160, Math.max(8, (width - 32) / duration)));
      }
      const id = crypto.randomUUID();
      const next: BoardClip = {
        id,
        path: filePath,
        name: fileName(filePath),
        start: 0,
        end: duration,
        volume: 1,
        crop: null,
        hasAudio: Boolean(probe.audioCodec),
        width: probe.width ?? 1280,
        height: probe.height ?? 720,
        fps: probe.fps ?? 30,
        duration,
      };
      setClips((current) => [...current, next]);
      setSelectedId(id);
      setCropMode(false);
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Clip could not be added");
    }
  }

  function patch(id: string, change: Partial<BoardClip>): void {
    setClips((current) => current.map((clip) => (clip.id === id ? { ...clip, ...change } : clip)));
  }

  function togglePlay(): void {
    const video = videoRef.current;
    if (!video) {
      const first = clips[0];
      if (!first) return;
      resumePlay.current = true;
      seekTo.current = first.start;
      setSelectedId(first.id);
      setCursor(0);
      return;
    }
    if (!video.paused) {
      video.pause();
      return;
    }
    if (selected && (video.currentTime < selected.start || video.currentTime > selected.end - 0.05)) {
      video.currentTime = selected.start;
    }
    void video.play().catch(() => setPlaying(false));
  }
  toggleRef.current = togglePlay;

  function timeAt(event: { clientX: number }): number {
    const node = lineRef.current;
    if (!node) return 0;
    const box = node.getBoundingClientRect();
    return (event.clientX - box.left + node.scrollLeft) / zoom;
  }

  function scrubMove(event: { clientX: number }): void {
    if (!scrubbing.current) return;
    seekTimeline(timeAt(event));
  }

  function seekTimeline(at: number): void {
    const clamped = Math.max(0, Math.min(total, at));
    setCursor(clamped);
    const place = locateTime(clips, clamped);
    if (!place) return;
    const clip = clips[place.index];
    const source = clip.start + place.into;
    setSelectedId(clip.id);
    setCropMode(false);
    seekTo.current = source;
    setTime(source);
    if (videoRef.current && selectedId === clip.id) videoRef.current.currentTime = source;
  }

  function splitHere(): void {
    const rightId = crypto.randomUUID();
    const next = splitClip(clips, cursor, (clip) => ({ ...clip, id: rightId }));
    if (next.length === clips.length) {
      setNotice("Zoom in and place the playhead inside a clip.");
      return;
    }
    setClips(next);
    setSelectedId(rightId);
    setNotice(null);
  }

  function measure(): void {
    const stage = stageRef.current;
    const video = videoRef.current;
    if (!stage || !video || !selected) return;
    const outer = stage.getBoundingClientRect();
    const box = containedVideoBox(
      { left: 0, top: 0, width: outer.width, height: outer.height },
      video.videoWidth || selected.width,
      video.videoHeight || selected.height,
    );
    setVideoBox(box);
  }

  const shown = media.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function exportLine(): Promise<void> {
    if (busy || clips.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const payload = clips.map((clip) => ({
        path: clip.path,
        start: clip.start,
        end: clip.end,
        volume: clip.volume,
        crop: clip.crop,
        hasAudio: clip.hasAudio,
        width: clip.width,
        height: clip.height,
        fps: clip.fps,
      }));
      const result = await window.lumen.startSequence(payload);
      jobId.current = result.jobId;
      setProgress(0);
    } catch (error) {
      setBusy(false);
      setNotice(error instanceof Error ? error.message : "Export failed");
    }
  }

  return (
    <section className="studio-board">
      <header className="studio-head">
        <BackButton onClick={onBack} />
        <div>
          <span className="hub-kicker">STUDIO</span>
          <strong>Editor</strong>
        </div>
        <button type="button" className="export-btn" disabled={busy || clips.length === 0} onClick={() => void exportLine()}>
          {progress !== null ? `Exporting ${Math.round(progress * 100)}%` : "Export"}
        </button>
        <WindowControls
          onMinimize={() => window.lumen.minimize()}
          onMaximize={() => window.lumen.toggleMaximize()}
          onClose={() => window.lumen.close()}
        />
      </header>
      <div className="studio-body">
        <aside className="studio-media">
          <label className="studio-search">
            <span>Media</span>
            <input value={query} placeholder="Search clips" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="studio-folders">
            {folders.map((item) => (
              <button
                key={item.directory}
                type="button"
                className={folder === item.directory ? "is-on" : ""}
                onClick={() => setFolder(item.directory)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div
            className="studio-bin"
            onDragOver={(event) => event.preventDefault()}
          >
            {shown.map((item) => (
              <button
                key={item.path}
                type="button"
                className="studio-media-card"
                draggable
                onDragStart={(event) => event.dataTransfer.setData("text/plain", item.path)}
                onClick={() => void addClip(item.path)}
              >
                <span className="studio-thumb"><Poster poster={posters[item.path]} /></span>
                <span>{clipTitle(item.name)}</span>
              </button>
            ))}
          </div>
        </aside>
        <div className="studio-stage">
          <div className="studio-screen" ref={stageRef}>
            {selected ? (
              <video
                ref={videoRef}
                key={selected.id}
                src={mediaUrl(selected.path)}
                onLoadedMetadata={() => {
                  measure();
                  const video = videoRef.current;
                  if (video && seekTo.current !== null) {
                    video.currentTime = seekTo.current;
                    seekTo.current = null;
                  }
                  if (video && resumePlay.current) {
                    resumePlay.current = false;
                    void video.play().catch(() => setPlaying(false));
                  }
                }}
                onClick={() => { if (!cropMode) togglePlay(); }}
                onPlay={() => {
                  setPlaying(true);
                  const video = videoRef.current;
                  if (video && video.currentTime < selected.start) video.currentTime = selected.start;
                }}
                onPause={() => setPlaying(false)}
              />
            ) : (
              <p>Drop clips from Media onto the timeline.</p>
            )}
            {cropMode && selected?.crop && videoBox ? (
              <CropOverlay
                rect={selected.crop}
                frame={{ width: selected.width, height: selected.height }}
                videoBox={videoBox}
                aspect={aspect}
                onChange={(rect) => patch(selected.id, { crop: rect })}
                onAspect={setAspect}
              />
            ) : null}
          </div>
          {selected ? (
            <div className="studio-tools">
              <TrimTrack
                duration={selected.duration}
                time={time}
                trim
                start={selected.start}
                end={selected.end}
                onSeek={(next) => {
                  if (videoRef.current) videoRef.current.currentTime = next;
                  setTime(next);
                }}
                onRange={(start, end) => patch(selected.id, { start, end })}
              />
              <VolumeControl
                value={selected.volume}
                onChange={(value) => patch(selected.id, { volume: value })}
              />
              <button
                type="button"
                className={cropMode ? "choice is-on" : "choice"}
                onClick={() => {
                  if (!selected) return;
                  const next = !cropMode;
                  setCropMode(next);
                  if (next && !selected.crop) {
                    patch(selected.id, { crop: defaultCrop(selected.width, selected.height) });
                  }
                  measure();
                }}
              >
                Crop
              </button>
            </div>
          ) : null}
          <div className="studio-tools studio-transport">
            <button
              type="button"
              className="studio-play"
              aria-label={playing ? "Pause" : "Play"}
              data-tooltip={playing ? "Pause · Space" : "Play · Space"}
              disabled={clips.length === 0}
              onClick={togglePlay}
            >
              <PlaybackGlyph playing={playing} />
            </button>
            <span className="studio-cursor">{formatClock(cursor)} / {formatClock(total)}</span>
            <button type="button" className="choice" disabled={clips.length === 0} onClick={splitHere}>Split</button>
            <button
              type="button"
              className="choice"
              disabled={!selected}
              onClick={() => {
                if (!selectedId) return;
                setClips((current) => current.filter((clip) => clip.id !== selectedId));
                setSelectedId(null);
              }}
            >
              Delete
            </button>
            <label className="studio-zoom">
              Zoom
              <input
                type="range"
                min={8}
                max={480}
                value={zoom}
                aria-label="Timeline zoom"
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
          </div>
          <div
            className="studio-line"
            ref={lineRef}
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("button, .studio-playhead")) return;
              press.current = { x: event.clientX, y: event.clientY, time: timeAt(event) };
            }}
            onPointerMove={scrubMove}
            onPointerUp={(event) => {
              if (scrubbing.current) {
                scrubbing.current = false;
                return;
              }
              const start = press.current;
              press.current = null;
              if (!start) return;
              const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
              if (moved > 5 || (event.target as HTMLElement).closest("button")) return;
              videoRef.current?.pause();
              seekTimeline(start.time);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const filePath = event.dataTransfer.getData("text/plain");
              if (filePath) void addClip(filePath);
            }}
          >
            {clips.length === 0 ? <span className="studio-empty">Timeline</span> : (
              <div className="studio-sheet" style={{ width: Math.max(viewport.width, total * zoom) }}>
                <div className="studio-ruler" style={{ width: Math.max(1, total * zoom) }}>
                  {rulerMarks.map((mark) => (
                    <span key={mark} style={{ left: mark * zoom }}>{rulerLabel(mark, step)}</span>
                  ))}
                </div>
                <div
                  className="studio-playhead"
                  style={{ left: cursor * zoom }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    scrubbing.current = true;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    videoRef.current?.pause();
                  }}
                  onPointerMove={scrubMove}
                  onPointerUp={() => { scrubbing.current = false; }}
                />
                <div className="studio-track" style={{ width: Math.max(1, total * zoom) }}>
                  {clips.map((clip) => {
                    const width = Math.max(1, clipSpan(clip) * zoom);
                    let origin = 0;
                    for (const item of clips) {
                      if (item.id === clip.id) break;
                      origin += clipSpan(item) * zoom;
                    }
                    return (
                      <article
                        key={clip.id}
                        className={clip.id === selectedId ? "is-on" : ""}
                        style={{ width }}
                        draggable
                        onDragStart={(event) => event.dataTransfer.setData("application/x-lumen-clip", clip.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const id = event.dataTransfer.getData("application/x-lumen-clip");
                          const filePath = event.dataTransfer.getData("text/plain");
                          if (filePath && !id) {
                            void addClip(filePath);
                            return;
                          }
                          if (!id || id === clip.id) return;
                          setClips((current) => {
                            const moving = current.find((item) => item.id === id);
                            if (!moving) return current;
                            const rest = current.filter((item) => item.id !== id);
                            const at = rest.findIndex((item) => item.id === clip.id);
                            rest.splice(at < 0 ? rest.length : at, 0, moving);
                            return rest;
                          });
                        }}
                      >
                        <Filmstrip
                          path={clip.path}
                          start={clip.start}
                          end={clip.end}
                          width={width}
                          poster={posterImage(posters[clip.path])}
                          viewLeft={viewport.left - origin}
                          viewRight={viewport.left + viewport.width - origin}
                        />
                        <span className="studio-chip">{clipTitle(clip.name)}</span>
                        <button
                          type="button"
                          data-remove
                          aria-label={`Remove ${clip.name}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => {
                            setClips((current) => current.filter((item) => item.id !== clip.id));
                            if (selectedId === clip.id) setSelectedId(null);
                          }}
                        >
                          <Icon name="close" />
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {notice ? <p className="studio-note">{notice}</p> : null}
        </div>
      </div>
    </section>
  );
}
