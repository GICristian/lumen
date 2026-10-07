import { useEffect, useRef, useState } from "react";
import type { ExportRequest, FolderItem, PrepareResult } from "@shared/contracts";
import { containedVideoBox, defaultCrop, type ScreenBox, type VideoRect } from "@shared/crop";
import {
  SIZE_PRESETS,
  clipTitle,
  estimateExportBytes,
  formatBytes,
  formatMbps,
} from "@shared/clips";
import { requiresStreamCopy } from "@shared/probe";
import { normalizeRange, segmentShouldRestart } from "@shared/range";
import { formatClock, mediaUrl } from "../player/usePlayback";
import { Icon } from "./Icon";
import { TrimTrack } from "./TrimTrack";
import { CropOverlay } from "./CropOverlay";
import { VolumeControl } from "./VolumeControl";
import { PlaybackGlyph } from "./PlaybackGlyph";
import { pausePlayback, resumePlayback } from "../player/resumePlayback";

type Props = {
  item: FolderItem;
  volume: number;
  busy: boolean;
  progress: number | null;
  onBack: () => void;
  onVolume: (value: number) => void;
  onExport: (request: ExportRequest) => void;
  onCancel: () => void;
  status: string | null;
  favorite?: boolean;
  onFavorite?: () => void;
};

const unplayable = "This clip can't be played. Download still uses the original file.";

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || target.isContentEditable;
}

export function OverlayDetail({
  item,
  volume,
  busy,
  progress,
  onBack,
  onVolume,
  onExport,
  onCancel,
  status,
  favorite = false,
  onFavorite,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const triedProxy = useRef(false);
  const usingProxy = useRef(false);
  const generation = useRef(0);
  const timeRef = useRef(0);
  const scrubbing = useRef(false);
  const resumeAfterScrub = useRef(false);
  const durationRef = useRef(0);
  const trimRef = useRef(false);
  const [prepared, setPrepared] = useState<PrepareResult | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [time, setTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [trimOn, setTrimOn] = useState(false);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [customKbps, setCustomKbps] = useState(8000);
  const [original, setOriginal] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<VideoRect | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [stageBox, setStageBox] = useState<ScreenBox | null>(null);
  const [videoFrame, setVideoFrame] = useState<{ width: number; height: number } | null>(null);

  timeRef.current = time;
  trimRef.current = trimOn;

  useEffect(() => {
    const hidden = (): void => { if (document.hidden && videoRef.current) pausePlayback(videoRef.current); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); if (videoRef.current) pausePlayback(videoRef.current); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = generation.current + 1;
    generation.current = token;
    triedProxy.current = false;
    usingProxy.current = false;
    setPrepared(null);
    setSrc(null);
    setNotice(null);
    setRendering(false);
    setTrimOn(false);
    setRange({ start: 0, end: 0 });
    setOriginal(true);
    setPlaying(false);
    setBuffering(false);
    setTime(0);
    setMediaDuration(0);
    setCropMode(false);
    setCropRect(null);
    setAspect(null);
    setVideoFrame(null);
    void window.lumen
      .prepare(item.path)
      .then((result) => {
        if (cancelled || token !== generation.current) return;
        setPrepared(result);
        if (result.playablePath) setSrc(mediaUrl(result.playablePath));
        else loadProxy();
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : "Clip failed to open");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item.path]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = (): void => {
      const rect = element.getBoundingClientRect();
      setStageBox({ left: 0, top: 0, width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [src]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (typingTarget(event.target)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) resumePlayback(video, () => setNotice('Playback could not resume. Reopen this clip.'));
        else pausePlayback(video);
        return;
      }
      if (!trimRef.current) return;
      const key = event.key.toLowerCase();
      if (key !== "i" && key !== "o") return;
      event.preventDefault();
      const at = timeRef.current;
      const dur = durationRef.current;
      setRange((current) => {
        const next =
          key === "i"
            ? normalizeRange(at, current.end || dur, dur)
            : normalizeRange(current.start, at, dur);
        return { start: next.a, end: next.b };
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const probe = prepared?.probe ?? null;
  const duration = mediaDuration || probe?.duration || 0;
  durationRef.current = duration;
  const hasAudio = probe?.audioCodec != null;
  const trimStart = trimOn ? range.start : 0;
  const trimEnd = trimOn && range.end > range.start ? range.end : duration;
  const span = trimOn ? Math.max(0, trimEnd - trimStart) : duration;
  const bitrate = original ? null : customKbps;
  const estimated = estimateExportBytes({
    sourceBytes: item.sizeBytes,
    durationSec: duration,
    spanSec: span,
    videoKbps: bitrate,
    hasAudio,
  });
  const sliderValue = Math.min(40000, Math.max(1000, bitrate ?? customKbps));
  const cropFrame = probe?.width && probe?.height
    ? { width: probe.width, height: probe.height }
    : videoFrame;
  const cropBox = stageBox && cropFrame
    ? containedVideoBox(stageBox, cropFrame.width, cropFrame.height)
    : null;

  function togglePlay(): void {
    const video = videoRef.current;
    if (!video) return;
    setNotice(null);
    if (video.paused) resumePlayback(video, () => { setBuffering(false); setNotice('Playback could not resume. Reopen this clip.'); });
    else { pausePlayback(video); setBuffering(false); }
  }

  function toggleTrim(): void {
    if (trimOn) {
      setTrimOn(false);
      return;
    }
    setTrimOn(true);
    setRange({ start: 0, end: duration });
  }

  function download(): void {
    if (!prepared?.ffmpegOk || busy) return;
    const copyOnly = requiresStreamCopy(probe?.videoCodec ?? null);
    const known = duration > 0;
    const cut = trimOn && known && span + 0.05 < duration;
    if (copyOnly && bitrate !== null) {
      setNotice("AV1 can't be resized, so this saves a copy of the clip.");
    }
    onExport({
      sourcePath: item.path,
      start: trimOn && known ? trimStart : null,
      end: trimOn && known ? trimEnd : null,
      duration: known ? duration : 0,
      crop: cropMode ? cropRect : null,
      hasAudio,
      precise: cropMode || (!copyOnly && (cut || bitrate !== null)),
      videoBitrateKbps: copyOnly ? null : bitrate,
      volume,
    });
  }

  function loadProxy(): void {
    if (triedProxy.current) return;
    triedProxy.current = true;
    const token = generation.current;
    const path = item.path;
    setRendering(true);
    void window.lumen.preview(path).then((proxy) => {
      if (token !== generation.current) return;
      setRendering(false);
      if (!proxy) {
        setNotice(unplayable);
        return;
      }
      usingProxy.current = true;
      setNotice(null);
      setSrc(mediaUrl(proxy));
    });
  }

  function onVideoError(): void {
    if (usingProxy.current) {
      setNotice(unplayable);
      setRendering(false);
      return;
    }
    loadProxy();
  }

  function onTime(media: HTMLVideoElement): void {
    const restart =
      trimOn &&
      segmentShouldRestart({
        current: media.currentTime,
        end: trimEnd,
        paused: media.paused,
        scrubbing: scrubbing.current,
        seeking: media.seeking,
        ended: media.ended,
      });
    if (restart) {
      media.currentTime = trimStart;
      setTime(trimStart);
      return;
    }
    setTime(media.currentTime);
  }

  return (
    <div className="overlay-detail">
      <div className="overlay-detail-bar">
        <button type="button" className="overlay-back" aria-label="Back to clips" onClick={onBack}>
          <Icon name="back" />
          <span>Back</span>
        </button>
        <div className="overlay-title" title={item.name}>
          {clipTitle(item.name)}
        </div>
        <VolumeControl value={volume} onChange={(next) => { onVolume(next); if (videoRef.current) videoRef.current.volume = next; }} />
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
      </div>
      <div className={cropMode ? "overlay-stage is-cropping" : "overlay-stage"} ref={stageRef}>
        {src ? (
          <video
            ref={videoRef}
            src={src}
            autoPlay
            playsInline
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => setBuffering(false)}
            onCanPlay={() => setBuffering(false)}
            onTimeUpdate={(event) => onTime(event.currentTarget)}
            onLoadedMetadata={(event) => {
              const media = event.currentTarget;
              media.volume = volume;
              if (Number.isFinite(media.duration)) setMediaDuration(media.duration);
              if (media.videoWidth > 0 && media.videoHeight > 0) {
                setVideoFrame({ width: media.videoWidth, height: media.videoHeight });
                setCropRect(defaultCrop(media.videoWidth, media.videoHeight));
              }
            }}
            onError={onVideoError}
          />
        ) : null}
        {src && !playing && !buffering ? (
          <div className="center-play" aria-hidden="true">
            <Icon name="play" />
          </div>
        ) : null}
        {(buffering || rendering || (!src && !notice)) ? <div className="playback-loading" role="status"><span className="loading-ring" /><span>{rendering ? "Rendering preview" : buffering ? "Buffering" : "Opening video"}</span></div> : null}
        {notice && !rendering ? <p className="overlay-stage-note">{notice}</p> : null}
        {cropMode && cropRect && cropFrame && cropBox ? (
          <CropOverlay rect={cropRect} frame={cropFrame} videoBox={cropBox} aspect={aspect} onChange={setCropRect} onAspect={setAspect} />
        ) : null}
      </div>
        <div className="detail-dock">
          <div className="detail-seek">
            <TrimTrack
              duration={duration}
              time={time}
              trim={trimOn}
              start={trimStart}
              end={trimEnd}
              onSeek={(next) => {
                if (videoRef.current) videoRef.current.currentTime = next;
                setTime(next);
              }}
              onRange={(start, end) => setRange({ start, end })}
              onScrub={(active) => {
                scrubbing.current = active;
                const video = videoRef.current;
                if (!video) return;
                if (active) {
                  resumeAfterScrub.current = !video.paused;
                  pausePlayback(video);
                  return;
                }
                if (resumeAfterScrub.current) resumePlayback(video, () => setNotice('Playback could not resume. Reopen this clip.'));
              }}
            />
            <span>
              {formatClock(time)} / {formatClock(duration)}
            </span>
          </div>
          <div className="detail-row">
            <button type="button" className="detail-play" aria-label={playing ? "Pause" : "Play"} data-tooltip={playing ? "Pause · Space" : "Play · Space"} disabled={!src} onClick={togglePlay}><PlaybackGlyph playing={playing} /></button>
            <button
              type="button"
              className={cropMode ? "choice is-on" : "choice"}
              aria-pressed={cropMode}
              disabled={!cropFrame}
              onClick={() => {
                const next = !cropMode;
                setCropMode(next);
                setAspect(null);
                if (next && cropFrame) setCropRect(defaultCrop(cropFrame.width, cropFrame.height));
              }}
            >Crop</button>
            <button
              type="button"
              className={trimOn ? "choice is-on" : "choice"}
              aria-pressed={trimOn}
              disabled={duration <= 0}
              onClick={toggleTrim}
            >
              Trim
            </button>
            <span className="trim-label">
              {trimOn ? `${formatClock(trimStart)} – ${formatClock(trimEnd)}` : "Full clip"}
            </span>
          </div>
        </div>
      <div className="detail-export">
        <div className="size-presets">
          <button
            type="button"
            className={original ? "choice is-on" : "choice"}
            aria-pressed={original}
            onClick={() => setOriginal(true)}
          >
            Original
          </button>
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={!original && customKbps === preset.kbps ? "choice is-on" : "choice"}
              aria-pressed={!original && customKbps === preset.kbps}
              onClick={() => {
                setOriginal(false);
                setCustomKbps(preset.kbps);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className="size-slider">
          <span>{bitrate === null ? "Source" : formatMbps(bitrate)}</span>
          <input
            type="range"
            min={1000}
            max={40000}
            step={500}
            value={sliderValue}
            disabled={original}
            aria-label="Export bitrate"
            onChange={(event) => {
              setOriginal(false);
              setCustomKbps(Number(event.target.value));
            }}
          />
        </label>
        <div className="size-estimate">
          <span>About</span>
          <strong>{formatBytes(estimated)}</strong>
        </div>
        {busy ? (
          <div className="export-progress" role="status"><progress aria-label="Export progress" max={1} value={progress ?? undefined} /><span>{progress === null ? "Exporting…" : `${Math.round(progress * 100)}%`}</span><button type="button" className="text-btn" onClick={onCancel}>Cancel</button></div>
        ) : (
          <button
            type="button"
            className="export-btn"
            disabled={!prepared?.ffmpegOk}
            onClick={download}
          >
            Export clip
          </button>
        )}
      </div>
      {status ? <p className="overlay-notice">{status}</p> : null}
      {prepared && !prepared.ffmpegOk ? (
        <p className="overlay-notice">ffmpeg is not available</p>
      ) : null}
    </div>
  );
}
