import { useEffect } from "react";
import type { ReplayCaptureOptions } from "@shared/contracts";
import { REPLAY_SEGMENT_SECONDS, replayDimensions } from "@shared/replay";
import { audioLimiter, microphoneConstraints } from "../player/replayAudio";

// H.264 first; VP8 avoids the considerably heavier VP9 fallback on many systems.
const MIMES = ["video/webm;codecs=h264,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];

function recordSlice(stream: MediaStream, mime: string, bits: number, signal: AbortSignal,
  setStop: (stop: (() => void) | null) => void): Promise<{ blob: Blob; duration: number; startedAt: number; endedAt: number }> {
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: bits, audioBitsPerSecond: 160_000 });
    const chunks: Blob[] = [];
    const started = performance.now();
    let stopped = started;
    let ended = false;
    let timer = 0;
    const stop = (): void => { if (recorder.state !== "inactive") { stopped = performance.now(); recorder.stop(); } };
    const cleanup = (): void => { window.clearTimeout(timer); signal.removeEventListener("abort", stop); setStop(null); };
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { if (!ended) { ended = true; cleanup(); reject(new Error("Recording failed.")); } };
    recorder.onstop = () => {
      if (ended) return;
      ended = true; cleanup();
      const end = stopped > started ? stopped : performance.now();
      resolve({ blob: new Blob(chunks, { type: mime || "video/webm" }), duration: Math.max(.001, (end - started) / 1000),
        startedAt: performance.timeOrigin + started, endedAt: performance.timeOrigin + end });
    };
    try {
      recorder.start();
      setStop(stop);
      signal.addEventListener("abort", stop, { once: true });
      timer = window.setTimeout(stop, REPLAY_SEGMENT_SECONDS * 1000);
      if (signal.aborted) stop();
    } catch (error) { cleanup(); reject(error); }
  });
}

/** Hidden recording surface: no visual loop, no timer polling, bounded IPC writes. */
export function ReplayCapture() {
  useEffect(() => {
    let active: AbortController | null = null;
    let stopSlice: (() => void) | null = null;
    let flushId: string | undefined;
    let sessionId = "";

    const run = async (options: ReplayCaptureOptions): Promise<void> => {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const { signal } = controller;
      sessionId = options.sessionId;
      let display: MediaStream | null = null;
      let mic: MediaStream | null = null;
      let context: AudioContext | null = null;
      let mixed: MediaStream | null = null;
      const release = (): void => {
        display?.getTracks().forEach((track) => track.stop());
        mic?.getTracks().forEach((track) => track.stop());
        mixed?.getTracks().forEach((track) => track.stop());
        if (context && context.state !== "closed") void context.close();
      };
      signal.addEventListener("abort", release, { once: true });
      try {
        const requested = replayDimensions(options.sourceWidth, options.sourceHeight, options.height);
        display = await navigator.mediaDevices.getDisplayMedia({ video: {
          width: { ideal: requested.width }, height: { ideal: requested.height }, frameRate: options.fps,
        }, audio: options.systemAudio });
        if (signal.aborted) return;
        const video = display.getVideoTracks()[0];
        if (!video) throw new Error("No screen to capture.");
        video.addEventListener("ended", () => {
          if (!signal.aborted) { window.lumen.replayCaptureFailed("Screen capture ended. Start replay to record again."); controller.abort(); }
        });
        const native = video.getSettings();
        const { width, height } = replayDimensions(native.width || requested.width, native.height || requested.height, options.height);
        // Constrain both dimensions so Chromium scales the complete source at its native ratio.
        const constraints: MediaTrackConstraints & { resizeMode: string } = { frameRate: { ideal: options.fps, max: options.fps },
          width: { ideal: width, max: width }, height: { ideal: height, max: height }, resizeMode: "crop-and-scale" };
        await video.applyConstraints(constraints);
        video.contentHint = "motion";
        if (signal.aborted) return;
        const tracks: MediaStreamTrack[] = [video];
        const heard = options.systemAudio && display.getAudioTracks().length > 0;
        let micOn = false;
        if (heard || options.mic) {
          // Recording does not need interactive output latency. Give the render thread
          // buffer headroom during GPU/CPU spikes and keep its native device clock.
          // MediaRecorder resamples the mix to Opus's 48 kHz clock.
          context = new AudioContext({ latencyHint: "playback" });
          const dest = context.createMediaStreamDestination();
          // A limiter prevents the combined system + microphone mix from hard clipping.
          const limiter = audioLimiter(context);
          limiter.connect(dest);
          if (heard) {
            const gain = context.createGain(); gain.gain.value = options.systemGain;
            context.createMediaStreamSource(display).connect(gain).connect(limiter);
          }
          if (options.mic) {
            try {
              mic = await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(
                options.micDeviceId, options.noiseSuppression, options.echoCancellation,
              ), video: false });
              if (signal.aborted) return;
              const gain = context.createGain(); gain.gain.value = options.micGain;
              context.createMediaStreamSource(mic).connect(gain).connect(limiter);
              micOn = true;
            } catch { if (signal.aborted) return; }
          }
          await context.resume();
          tracks.push(...dest.stream.getAudioTracks());
        }
        if (signal.aborted) return;
        const mime = MIMES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
        mixed = new MediaStream(tracks);
        const actual = video.getSettings();
        window.lumen.replayCaptureReady({ sessionId: options.sessionId, width: actual.width || width, height: actual.height || height, audio: heard, mic: micOn, codec: mime || "webm" });
        const recordingStream = mixed;
        const nextSlice = () => recordSlice(recordingStream, mime, options.bitrateKbps * 1000, signal, (stop: (() => void) | null) => { if (active === controller) stopSlice = stop; });
        let pendingSlice = nextSlice();
        while (!signal.aborted) {
          const slice = await pendingSlice;
          if (signal.aborted) break;
          const flushed = flushId; flushId = undefined;
          // Restart capture before disk IPC; at most one completed slice waits for its write.
          pendingSlice = nextSlice();
          void pendingSlice.catch(() => undefined);
          await window.lumen.replaySegment({ sessionId: options.sessionId, bytes: new Uint8Array(await slice.blob.arrayBuffer()), duration: slice.duration,
            startedAt: slice.startedAt, endedAt: slice.endedAt, flushId: flushed });
        }
      } catch (error) {
        if (!signal.aborted) window.lumen.replayCaptureFailed(error instanceof Error ? error.message : "Replay failed.");
      } finally {
        controller.abort();
        release(); signal.removeEventListener("abort", release);
        if (active === controller) { active = null; stopSlice = null; }
      }
    };
    const offStart = window.lumen.onReplayCaptureStart((options) => { flushId = undefined; void run(options); });
    const offStop = window.lumen.onReplayCaptureStop(() => { active?.abort(); active = null; stopSlice = null; });
    const offFlush = window.lumen.onReplayCaptureFlush((id) => {
      if (active) { flushId = id; stopSlice?.(); }
      else void window.lumen.replaySegment({ sessionId, bytes: new Uint8Array(), duration: 0, startedAt: 0, endedAt: 0, flushId: id });
    });
    window.lumen.replayCaptureMounted();
    return () => { active?.abort(); offStart(); offStop(); offFlush(); };
  }, []);
  return null;
}
