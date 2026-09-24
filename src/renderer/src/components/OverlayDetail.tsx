import { useEffect, useRef, useState } from "react";
import type { ExportRequest, FolderItem, PrepareResult } from "@shared/contracts";
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
import { TrimTrack } from "./TrimTrack";

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
};

const unplayable = "This clip can't be played. Download still uses the original file.";

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
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
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
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

  timeRef.current = time;
  trimRef.current = trimOn;

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
    setTime(0);
    setMediaDuration(0);
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
    const onKey = (event: KeyboardEvent): void => {
      if (typingTarget(event.target)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play();
        else video.pause();
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

  function togglePlay(): void {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
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
    if (copyOnly && bitrate !== null) {
      setNotice("AV1 can't be resized, so this saves a copy of the clip.");
    }
    onExport({
      sourcePath: item.path,
      start: trimOn && known ? trimStart : null,
      end: trimOn && known ? trimEnd : null,
      duration: known ? duration : 0,
      precise: !copyOnly && bitrate !== null,
      crop: null,
      hasAudio,
      videoBitrateKbps: copyOnly ? null : bitrate,
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
        <button type="button" className="back-btn" onClick={onBack}>
          Back
        </button>
        <div className="overlay-title" title={item.name}>
          {clipTitle(item.name)}
        </div>
        <label className="size-slider">
          <span>Vol {Math.round(volume * 100)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="Volume"
            onChange={(event) => {
              const next = Number(event.target.value);
              onVolume(next);
              if (videoRef.current) videoRef.current.volume = next;
            }}
          />
        </label>
      </div>
      <div className="overlay-stage">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            autoPlay
            playsInline
            onClick={togglePlay}
            onTimeUpdate={(event) => onTime(event.currentTarget)}
            onLoadedMetadata={(event) => {
              const media = event.currentTarget;
              media.volume = volume;
              if (Number.isFinite(media.duration)) setMediaDuration(media.duration);
            }}
            onError={onVideoError}
          />
        ) : null}
        {rendering ? <p className="overlay-stage-note">Rendering preview</p> : null}
        {notice && !rendering ? <p className="overlay-stage-note">{notice}</p> : null}
      </div>
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
              video.pause();
              return;
            }
            if (resumeAfterScrub.current) void video.play();
          }}
        />
        <span>
          {formatClock(time)} / {formatClock(duration)}
        </span>
      </div>
      <div className="detail-row">
        <button
          type="button"
          className={trimOn ? "text-btn is-on" : "text-btn"}
          disabled={duration <= 0}
          onClick={toggleTrim}
        >
          Trim
        </button>
        <span className="trim-label">
          {trimOn ? `${formatClock(trimStart)} – ${formatClock(trimEnd)}` : "Full clip"}
        </span>
      </div>
      <div className="detail-row">
        <div className="size-presets">
          <button
            type="button"
            className={original ? "text-btn is-on" : "text-btn"}
            onClick={() => setOriginal(true)}
          >
            Original
          </button>
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={!original && customKbps === preset.kbps ? "text-btn is-on" : "text-btn"}
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
          <span>Estimated</span>
          <strong>{formatBytes(estimated)}</strong>
        </div>
        {busy ? (
          <button type="button" className="export-btn" onClick={onCancel}>
            {progress === null ? "Cancel" : `${Math.round(progress * 100)}%`}
          </button>
        ) : (
          <button
            type="button"
            className="export-btn"
            disabled={!prepared?.ffmpegOk}
            onClick={download}
          >
            Download
          </button>
        )}
      </div>
      {status ? <p className="overlay-notice">{status}</p> : null}
      {notice ? <p className="overlay-notice">{notice}</p> : null}
      {prepared && !prepared.ffmpegOk ? (
        <p className="overlay-notice">ffmpeg is not available</p>
      ) : null}
    </div>
  );
}
