import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { FolderItem } from "@shared/contracts";
import { clipTitle, formatBytes } from "@shared/clips";
import { formatClock, mediaUrl } from "../player/usePlayback";
import { SeekHover, seekLeft } from "./SeekHover";
import { EditMenu } from "./EditMenu";
import { Icon } from "./Icon";
import { VolumeControl } from "./VolumeControl";
import { PlaybackGlyph } from "./PlaybackGlyph";
import { PlaybackFeedback } from "./PlaybackFeedback";
import { pausePlayback, resumePlayback } from "../player/resumePlayback";

export function OverlayPreview({
  item,
  onBack,
  onEdit,
  onStudio,
  volume,
  onVolume,
  favorite = false,
  onFavorite,
  hasPrevious = false,
  hasNext = false,
  onPrevious,
  onNext,
  onRenamed,
}: {
  item: FolderItem;
  onBack: () => void;
  onEdit: () => void;
  onStudio: () => void;
  volume: number;
  onVolume: (value: number) => void;
  favorite?: boolean;
  onFavorite?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onRenamed: (item: FolderItem) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [feedback, setFeedback] = useState("");
  const feedbackTimer = useRef(0);
  const lastVolume = useRef(volume);
  const audibleVolume = useRef(volume || 1);
  const [hover, setHover] = useState<{ ratio: number; time: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const naming = useRef(false);
  const skipBlur = useRef(false);
  function announce(text: string): void {
    window.clearTimeout(feedbackTimer.current); setFeedback(text);
    feedbackTimer.current = window.setTimeout(() => setFeedback(""), 1100);
  }
  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);
  useEffect(() => { setDraft(null); }, [item.path]);
  useEffect(() => {
    const pauseWhenHidden = (): void => { if (document.hidden && video.current) pausePlayback(video.current); };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => { document.removeEventListener("visibilitychange", pauseWhenHidden); if (video.current) pausePlayback(video.current); };
  }, []);
  useEffect(() => {
    let live = true;
    setSource(null);
    setNotice(null);
    setBuffering(false);
    void window.lumen.prepare(item.path).then((result) => {
      if (!live) return;
      if (result.playablePath) setSource(mediaUrl(result.playablePath));
      else void window.lumen.preview(item.path).then((proxy) => {
        if (!live) return;
        if (proxy) setSource(mediaUrl(proxy));
        else setNotice("This clip could not be previewed.");
      });
    }).catch((error: unknown) => {
      if (live) setNotice(error instanceof Error ? error.message : "Clip failed to open");
    });
    return () => { live = false; };
  }, [item.path, reload]);
  useEffect(() => {
    if (video.current) video.current.volume = volume;
    if (volume > 0) audibleVolume.current = volume;
    if (lastVolume.current !== volume) { lastVolume.current = volume; announce(volume ? `Volume ${Math.round(volume * 100)}%` : "Muted"); }
  }, [volume, source]);
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLElement && event.target.closest("input,button,select,textarea,[contenteditable]")) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const media = video.current;
      if (!media) return;
      if (event.code === "Space" || event.key.toLowerCase() === "k") { event.preventDefault(); togglePlayback(); }
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const delta = event.key === "ArrowLeft" ? -5 : 5; media.currentTime = Math.max(0, Math.min(media.duration || 0, media.currentTime + delta)); announce(`${delta > 0 ? "+" : "−"}5 seconds`); }
      else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); onVolume(Math.max(0, Math.min(1, volume + (event.key === "ArrowUp" ? .05 : -.05)))); }
      else if (event.key.toLowerCase() === "m") { event.preventDefault(); onVolume(volume ? 0 : audibleVolume.current); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [volume, onVolume]);
  async function commitName(raw: string): Promise<void> {
    if (naming.current) return;
    const next = raw.trim();
    if (!next || next === clipTitle(item.name)) {
      setDraft(null);
      return;
    }
    naming.current = true;
    setSource(null);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    try {
      const renamed = await window.lumen.renameClip(item.path, next);
      onRenamed(renamed);
      setDraft(null);
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : "Clip could not be renamed");
      setDraft(null);
      setReload((value) => value + 1);
    } finally {
      naming.current = false;
    }
  }
  function togglePlayback(): void {
    const media = video.current;
    if (!media) return;
    setNotice(null);
    if (media.paused) { resumePlayback(media, () => { setBuffering(false); setPlaying(false); setNotice("Playback could not resume. Reopen this clip to try again."); }); announce("Play"); }
    else { pausePlayback(media); setBuffering(false); announce("Paused"); }
  }
  return (
    <section className="overlay-preview">
      <header className="overlay-preview-head">
        <button type="button" className="overlay-back" aria-label="Back to clips" onClick={onBack}>
          <Icon name="back" />
          <span>Back</span>
        </button>
        <div className="overlay-preview-title">
          {draft === null ? (
            <button
              type="button"
              className="clip-rename"
              title="Rename clip"
              onClick={() => setDraft(clipTitle(item.name))}
            >
              {clipTitle(item.name)}
            </button>
          ) : (
            <input
              className="clip-rename"
              aria-label="Clip name"
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  skipBlur.current = true;
                  setDraft(null);
                }
              }}
              onBlur={() => {
                if (skipBlur.current) {
                  skipBlur.current = false;
                  return;
                }
                void commitName(draft);
              }}
            />
          )}
        </div>
        {onFavorite ? (
          <button
            type="button"
            className={favorite ? "icon-btn is-favorite" : "icon-btn"}
            aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={favorite}
            onClick={onFavorite}
          >
            <Icon name="star" />
          </button>
        ) : null}
        <button type="button" className="icon-btn" aria-label="Show in folder" data-tooltip="Show in folder" onClick={() => void window.lumen.showItem(item.path).catch(() => setNotice('Could not show this file in its folder.'))}><Icon name="folder" /></button>
        <EditMenu label="Edit" className="editor-entry" onQuick={onEdit} onStudio={onStudio} />
      </header>
      <div className="overlay-preview-screen">
        {source ? <video ref={video} src={source} autoPlay playsInline onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onCanPlay={() => setBuffering(false)} onError={() => { setBuffering(false); setNotice("This clip could not be previewed."); }} onClick={togglePlayback} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} /> : null}
        {source ? <button type="button" className="preview-pause" aria-label={playing ? "Pause preview" : "Play preview"} onClick={(event) => { event.stopPropagation(); togglePlayback(); }}><PlaybackGlyph playing={playing} /><span>{playing ? "Pause" : "Play"}</span></button> : null}
        {(!source || buffering) && !notice ? <div className="playback-loading" role="status"><span className="loading-ring" /><span>{buffering ? "Buffering" : "Preparing preview"}</span></div> : null}
        {notice ? <span className="overlay-preview-loading">{notice}</span> : null}
        {feedback ? <PlaybackFeedback text={feedback} /> : null}
      </div>
      <footer className="overlay-preview-meta">
        <div className="clip-step">
          <button type="button" disabled={!hasPrevious} onClick={onPrevious}>
            <Icon name="previous" /> Previous
          </button>
          <button type="button" disabled={!hasNext} onClick={onNext}>
            Next <Icon name="next" />
          </button>
        </div>
        <label className="preview-scrubber"><span>{formatClock(current)}</span><span className="preview-track" style={{ "--position": `${duration ? current / duration * 100 : 0}%` } as CSSProperties}>
          <input type="range" min={0} max={duration || 0} step={.1} disabled={!duration} value={Math.min(current, duration || 0)} aria-label="Preview position" aria-valuetext={`${formatClock(current)} of ${formatClock(duration)}`} onPointerMove={(event) => { const box = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)); setHover({ ratio, time: ratio * duration }); }} onPointerLeave={() => setHover(null)} onChange={(event) => { const next=Number(event.target.value); if(video.current) video.current.currentTime=next; setCurrent(next); }} />
          {hover && duration && item.path ? (
            <SeekHover path={item.path} time={hover.time} left={seekLeft(hover.time, duration)} />
          ) : null}
        </span><span>{formatClock(duration)}</span></label>
        <VolumeControl value={volume} onChange={onVolume} />
        <span>{formatBytes(item.sizeBytes)}</span>
      </footer>
    </section>
  );
}
