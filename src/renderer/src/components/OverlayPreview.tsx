import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { FolderItem } from "@shared/contracts";
import { clipTitle, formatBytes } from "@shared/clips";
import { formatClock } from "../player/usePlayback";
import { mediaUrl } from "../player/usePlayback";
import { Icon } from "./Icon";
import { VolumeControl } from "./VolumeControl";
import { PlaybackGlyph } from "./PlaybackGlyph";
import { PlaybackFeedback } from "./PlaybackFeedback";
import { pausePlayback, resumePlayback } from "../player/resumePlayback";

export function OverlayPreview({
  item,
  onBack,
  onEdit,
  volume,
  onVolume,
}: {
  item: FolderItem;
  onBack: () => void;
  onEdit: () => void;
  volume: number;
  onVolume: (value: number) => void;
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
  function announce(text: string): void {
    window.clearTimeout(feedbackTimer.current); setFeedback(text);
    feedbackTimer.current = window.setTimeout(() => setFeedback(""), 1100);
  }
  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);
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
  }, [item.path]);
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
        <button type="button" className="icon-btn" aria-label="Back to clips" onClick={onBack}><Icon name="back" /></button>
        <div className="overlay-preview-title"><span className="hub-kicker">QUICK LOOK</span><strong title={item.name}>{clipTitle(item.name)}</strong></div>
        <button type="button" className="icon-btn" aria-label="Show in folder" data-tooltip="Show in folder" onClick={() => void window.lumen.showItem(item.path).catch(() => setNotice('Could not show this file in its folder.'))}><Icon name="folder" /></button>
        <button type="button" className="editor-entry" onClick={onEdit}><Icon name="edit" /> Open in editor</button>
      </header>
      <div className="overlay-preview-screen">
        {source ? <video ref={video} src={source} autoPlay playsInline onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onCanPlay={() => setBuffering(false)} onError={() => { setBuffering(false); setNotice("This clip could not be previewed."); }} onClick={togglePlayback} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} /> : null}
        {source ? <button type="button" className="preview-pause" aria-label={playing ? "Pause preview" : "Play preview"} onClick={(event) => { event.stopPropagation(); togglePlayback(); }}><PlaybackGlyph playing={playing} /><span>{playing ? "Pause" : "Play"}</span></button> : null}
        {(!source || buffering) && !notice ? <div className="playback-loading" role="status"><span className="loading-ring" /><span>{buffering ? "Buffering" : "Preparing preview"}</span></div> : null}
        {notice ? <span className="overlay-preview-loading">{notice}</span> : null}
        {feedback ? <PlaybackFeedback text={feedback} /> : null}
      </div>
      <footer className="overlay-preview-meta">
        <span>{item.name}</span>
        <label className="preview-scrubber"><span>{formatClock(current)}</span><span className="preview-track" style={{ "--position": `${duration ? current / duration * 100 : 0}%` } as CSSProperties}>
          <input type="range" min={0} max={duration || 0} step={.1} disabled={!duration} value={Math.min(current, duration || 0)} aria-label="Preview position" aria-valuetext={`${formatClock(current)} of ${formatClock(duration)}`} onPointerMove={(event) => { const box = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)); setHover({ ratio, time: ratio * duration }); }} onPointerLeave={() => setHover(null)} onChange={(event) => { const next=Number(event.target.value); if(video.current) video.current.currentTime=next; setCurrent(next); }} />
          {hover && duration ? <output className="preview-time-tooltip" style={{ left: `clamp(28px, ${hover.ratio * 100}%, calc(100% - 28px))` }}>{formatClock(hover.time)}</output> : null}
        </span><span>{formatClock(duration)}</span></label>
        <VolumeControl value={volume} onChange={onVolume} />
        <span>{formatBytes(item.sizeBytes)}</span>
      </footer>
    </section>
  );
}
