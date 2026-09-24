import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { containedVideoBox, type ScreenBox, type VideoRect } from "@shared/crop";
import { segmentShouldRestart, type Marks } from "@shared/range";
import {
  clampPan,
  nextZoomScale,
  panBy,
  scaleFromWheel,
  zoomToward,
  type Zoom,
} from "@shared/zoom";
import { CropOverlay } from "./CropOverlay";
import { mediaUrl } from "../player/usePlayback";

type Frame = { width: number; height: number };

type Props = {
  playablePath: string | null;
  volume: number;
  loopWhole: boolean;
  segment: boolean;
  marks: Marks;
  scrubbing: boolean;
  osd: string | null;
  banner: string | null;
  empty: boolean;
  cropMode: boolean;
  cropRect: VideoRect | null;
  frame: Frame | null;
  aspect: number | null;
  onCrop: (rect: VideoRect) => void;
  onAspect: (aspect: number | null) => void;
  onTime: (time: number) => void;
  onReady: (duration: number, frame: Frame) => void;
  onPlaying: (playing: boolean) => void;
  onTogglePlay: () => void;
  onFullscreen: () => void;
  onError: () => void;
  onOpen: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

export type VideoStageHandle = {
  zoomBy: (direction: -1 | 1) => void;
  resetZoom: () => void;
};

const unplayable = "This clip can't be played. You can still export it if ffmpeg can read it.";
const identity: Zoom = { scale: 1, x: 0, y: 0 };

export const VideoStage = forwardRef<VideoStageHandle, Props>(function VideoStage(props, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<ScreenBox | null>(null);
  const [zoomEpoch, setZoomEpoch] = useState(0);
  const clickTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const zoomRef = useRef<Zoom>(identity);
  const labelRef = useRef<HTMLButtonElement>(null);
  const geometryRef = useRef<{ videoBox: ScreenBox | null; container: ScreenBox | null }>({
    videoBox: null,
    container: null,
  });
  const cropModeRef = useRef(props.cropMode);
  cropModeRef.current = props.cropMode;

  useEffect(() => {
    zoomRef.current = identity;
    const picture = pictureRef.current;
    if (picture) picture.style.transform = "translate3d(0px, 0px, 0) scale(1)";
    wrapRef.current?.classList.remove("is-zoomed");
    if (labelRef.current) labelRef.current.textContent = "100%";
  }, [props.playablePath]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const update = (): void => {
      const rect = element.getBoundingClientRect();
      setContainer({ left: 0, top: 0, width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const onVisible = (): void => {
      if (document.visibilityState !== "visible") return;
      update();
      window.requestAnimationFrame(update);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [props.playablePath, props.empty]);

  const videoBox =
    container && props.frame
      ? containedVideoBox(container, props.frame.width, props.frame.height)
      : null;
  const videoMounted = Boolean(props.playablePath && videoBox);
  geometryRef.current = { videoBox, container };

  useEffect(() => {
    const video = props.videoRef.current;
    const start = props.marks.a;
    const end = props.marks.b;
    if (!videoMounted || !video || !props.segment || start === null || end === null) return;

    let timeout: number | null = null;
    const pullBack = (): void => {
      if (timeout !== null) return;
      const resume = !video.paused || video.ended;
      if (
        !segmentShouldRestart({
          current: video.currentTime,
          end,
          paused: video.paused,
          scrubbing: props.scrubbing,
          seeking: video.seeking,
          ended: video.ended,
        })
      ) {
        return;
      }
      // The media clock overwrites currentTime assigned inside timeupdate.
      timeout = window.setTimeout(() => {
        timeout = null;
        video.currentTime = start;
        if (resume) void video.play().catch(() => undefined);
      }, 0);
    };

    video.addEventListener("timeupdate", pullBack);
    video.addEventListener("ended", pullBack);
    const timer = window.setInterval(pullBack, 80);
    return () => {
      video.removeEventListener("timeupdate", pullBack);
      video.removeEventListener("ended", pullBack);
      window.clearInterval(timer);
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [
    videoMounted,
    props.segment,
    props.marks.a,
    props.marks.b,
    props.scrubbing,
    props.videoRef,
  ]);

  function paint(next: Zoom): void {
    zoomRef.current = next;
    const picture = pictureRef.current;
    if (picture) {
      const x = next.x.toFixed(2);
      const y = next.y.toFixed(2);
      const scale = next.scale.toFixed(4);
      picture.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    }
    wrapRef.current?.classList.toggle("is-zoomed", next.scale > 1);
    if (labelRef.current) labelRef.current.textContent = `${Math.round(next.scale * 100)}%`;
    if (cropModeRef.current) setZoomEpoch((value) => value + 1);
  }

  function applyZoom(nextScale: number, cursor: { x: number; y: number } | null): void {
    const { videoBox: box, container: view } = geometryRef.current;
    if (!box || !view) return;
    const origin = { x: box.left, y: box.top };
    const picture = { width: box.width, height: box.height };
    const viewSize = { width: view.width, height: view.height };
    const current = zoomRef.current;
    const point = cursor ?? {
      x: origin.x + current.x + (picture.width * current.scale) / 2,
      y: origin.y + current.y + (picture.height * current.scale) / 2,
    };
    paint(zoomToward(current, origin, point, nextScale, picture, viewSize));
  }

  const applyZoomRef = useRef(applyZoom);
  applyZoomRef.current = applyZoom;

  useImperativeHandle(ref, () => ({
    zoomBy(direction) {
      applyZoomRef.current(nextZoomScale(zoomRef.current.scale, direction > 0), null);
    },
    resetZoom() {
      paint(identity);
    },
  }));

  useLayoutEffect(() => {
    const { videoBox: box, container: view } = geometryRef.current;
    if (!box || !view) return;
    const next = clampPan(
      zoomRef.current,
      { x: box.left, y: box.top },
      { width: box.width, height: box.height },
      { width: view.width, height: view.height },
    );
    const unchanged =
      next.scale === zoomRef.current.scale &&
      next.x === zoomRef.current.x &&
      next.y === zoomRef.current.y;
    if (!unchanged) paint(next);
  }, [
    videoBox?.left,
    videoBox?.top,
    videoBox?.width,
    videoBox?.height,
    container?.width,
    container?.height,
  ]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let frame = 0;
    let pending = 0;
    let clientX = 0;
    let clientY = 0;
    const onWheel = (event: WheelEvent): void => {
      if (!geometryRef.current.videoBox) return;
      event.preventDefault();
      const lineDelta = event.deltaMode === 1 ? event.deltaY * 16 : 0;
      const pageDelta = event.deltaMode === 2 ? event.deltaY * wrap.clientHeight : 0;
      const pixels = event.deltaMode === 0 ? event.deltaY : lineDelta || pageDelta;
      pending += pixels;
      clientX = event.clientX;
      clientY = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const delta = pending;
        pending = 0;
        const rect = wrap.getBoundingClientRect();
        applyZoomRef.current(scaleFromWheel(zoomRef.current.scale, delta), {
          x: clientX - rect.left,
          y: clientY - rect.top,
        });
      });
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      wrap.removeEventListener("wheel", onWheel);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    const targetNode = event.target;
    if (targetNode instanceof Element && targetNode.closest(".zoom-controls")) return;
    const { videoBox: box, container: view } = geometryRef.current;
    if (zoomRef.current.scale <= 1 || props.cropMode || !box || !view) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const originZoom = zoomRef.current;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let frame = 0;
    let dx = 0;
    let dy = 0;
    const move = (ev: PointerEvent): void => {
      dx = ev.clientX - startX;
      dy = ev.clientY - startY;
      if (Math.hypot(dx, dy) > 4) suppressClick.current = true;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint(
          panBy(
            originZoom,
            dx,
            dy,
            { x: box.left, y: box.top },
            { width: box.width, height: box.height },
            { width: view.width, height: view.height },
          ),
        );
      });
    };
    const up = (): void => {
      if (frame) cancelAnimationFrame(frame);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  function onClick(): void {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      props.onTogglePlay();
      clickTimer.current = null;
    }, 220);
  }

  function onDoubleClick(): void {
    if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    clickTimer.current = null;
    props.onFullscreen();
  }

  const shown = zoomEpoch >= 0 ? zoomRef.current : identity;
  const cropBox = videoBox
    ? {
        left: videoBox.left + shown.x,
        top: videoBox.top + shown.y,
        width: videoBox.width * shown.scale,
        height: videoBox.height * shown.scale,
      }
    : null;

  return (
    <div
      className={shown.scale > 1 ? "video-wrap is-zoomed" : "video-wrap"}
      ref={wrapRef}
      onPointerDown={props.playablePath ? onPointerDown : undefined}
      onClick={props.playablePath ? onClick : undefined}
      onDoubleClick={props.playablePath ? onDoubleClick : undefined}
    >
      {props.playablePath && videoBox ? (
        <div
          className="picture"
          ref={pictureRef}
          style={{
            left: videoBox.left,
            top: videoBox.top,
            width: videoBox.width,
            height: videoBox.height,
            transform: `translate3d(${shown.x}px, ${shown.y}px, 0) scale(${shown.scale})`,
          }}
        >
          <video
            ref={props.videoRef}
            src={mediaUrl(props.playablePath)}
            loop={props.loopWhole && !props.segment}
            onTimeUpdate={(event) => props.onTime(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              video.volume = props.volume;
              props.onReady(video.duration, {
                width: video.videoWidth,
                height: video.videoHeight,
              });
              void video.play().catch(() => props.onPlaying(false));
            }}
            onPlay={() => props.onPlaying(true)}
            onPause={() => props.onPlaying(false)}
            onError={() => props.onError()}
          />
        </div>
      ) : null}
      {props.cropMode && props.cropRect && props.frame && cropBox ? (
        <CropOverlay
          rect={props.cropRect}
          frame={props.frame}
          videoBox={cropBox}
          aspect={props.aspect}
          onChange={props.onCrop}
          onAspect={props.onAspect}
        />
      ) : null}
      {props.playablePath ? (
        <div
          className="zoom-controls"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => applyZoom(nextZoomScale(zoomRef.current.scale, false), null)}
          >
            −
          </button>
          <button type="button" ref={labelRef} onClick={() => paint(identity)}>
            {Math.round(shown.scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => applyZoom(nextZoomScale(zoomRef.current.scale, true), null)}
          >
            +
          </button>
        </div>
      ) : null}
      {props.osd ? <div className="osd">{props.osd}</div> : null}
      {props.empty ? (
        <div className="empty">
          <div className="empty-mark">Lumen</div>
          <h1>Open a video</h1>
          <p>
            Left and Right move one second. Shift plus an arrow jumps 5%. Drag the timeline to
            any second.
          </p>
          <button type="button" className="export-btn" onClick={props.onOpen}>
            Open a video
          </button>
          {props.banner ? <p className="banner-text">{props.banner}</p> : null}
        </div>
      ) : null}
      {!props.empty && props.banner ? <div className="stage-banner">{props.banner}</div> : null}
      {!props.empty && !props.playablePath && !props.banner ? (
        <div className="stage-banner">{unplayable}</div>
      ) : null}
    </div>
  );
});
