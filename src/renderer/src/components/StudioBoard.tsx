import { useEffect, useRef, useState } from "react";
import type { FolderItem, LumenFolder } from "@shared/contracts";
import { containedVideoBox, defaultCrop, type ScreenBox } from "@shared/crop";
import type { SequenceClip } from "@shared/sequence";
import { clipTitle } from "@shared/clips";
import { formatClock, mediaUrl } from "../player/usePlayback";
import { CropOverlay } from "./CropOverlay";
import { Icon } from "./Icon";
import { TrimTrack } from "./TrimTrack";
import { VolumeControl } from "./VolumeControl";

export type StudioSeed = { path: string; token: number };

type BoardClip = SequenceClip & { id: string; name: string; duration: number };

function fileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
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
  const jobId = useRef<string | null>(null);
  const selected = clips.find((clip) => clip.id === selectedId) ?? null;

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
    const video = videoRef.current;
    if (!video || !selected) return;
    const tick = (): void => {
      const end = selected.end;
      if (video.currentTime >= end - 0.04) video.currentTime = selected.start;
      setTime(video.currentTime);
    };
    video.addEventListener("timeupdate", tick);
    return () => video.removeEventListener("timeupdate", tick);
  }, [selected]);

  async function addClip(filePath: string): Promise<void> {
    try {
      const prepared = await window.lumen.prepare(filePath);
      const probe = prepared.probe;
      const duration = probe.duration ?? 0;
      if (duration <= 0) {
        setNotice("This clip has no duration.");
        return;
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
        <button type="button" className="hub-back" onClick={onBack}>Back</button>
        <div>
          <span className="hub-kicker">STUDIO</span>
          <strong>Editor</strong>
        </div>
        <button type="button" className="export-btn" disabled={busy || clips.length === 0} onClick={() => void exportLine()}>
          {progress !== null ? `Exporting ${Math.round(progress * 100)}%` : "Export"}
        </button>
        <div className="window-controls">
          <button type="button" className="win-btn" aria-label="Minimize" onClick={() => window.lumen.minimize()}>–</button>
          <button type="button" className="win-btn" aria-label="Maximize" onClick={() => window.lumen.toggleMaximize()}>□</button>
          <button type="button" className="win-btn close" aria-label="Close" onClick={() => window.lumen.close()}>×</button>
        </div>
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
                draggable
                onDragStart={(event) => event.dataTransfer.setData("text/plain", item.path)}
                onClick={() => void addClip(item.path)}
              >
                {clipTitle(item.name)}
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
                onLoadedMetadata={measure}
                onPlay={() => {
                  const video = videoRef.current;
                  if (video && video.currentTime < selected.start) video.currentTime = selected.start;
                }}
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
              <button type="button" className="choice" onClick={() => videoRef.current?.play()}>Play</button>
            </div>
          ) : null}
          <div
            className="studio-line"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const filePath = event.dataTransfer.getData("text/plain");
              if (filePath) void addClip(filePath);
            }}
          >
            {clips.length === 0 ? <span>Timeline</span> : clips.map((clip, index) => (
              <article
                key={clip.id}
                className={clip.id === selectedId ? "is-on" : ""}
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
                <button type="button" onClick={() => { setSelectedId(clip.id); setCropMode(false); }}>
                  <em>{index + 1}</em>
                  {clipTitle(clip.name)}
                  <small>{formatClock(clip.end - clip.start)}</small>
                </button>
                <button type="button" aria-label={`Remove ${clip.name}`} onClick={() => {
                  setClips((current) => current.filter((item) => item.id !== clip.id));
                  if (selectedId === clip.id) setSelectedId(null);
                }}>
                  <Icon name="close" />
                </button>
              </article>
            ))}
          </div>
          {notice ? <p className="studio-note">{notice}</p> : null}
        </div>
      </div>
    </section>
  );
}
