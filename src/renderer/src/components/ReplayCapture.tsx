import { useEffect } from "react";
import type { ReplayCaptureOptions } from "@shared/contracts";
import { REPLAY_SEGMENT_SECONDS, replayDimensions } from "@shared/replay";
import { splitWebmChunk } from "@shared/webmPieces";
import {
  humFilter,
  microphoneConstraints,
  releaseSystemProcessing,
  systemAudioConstraints,
} from "../player/replayAudio";

// High profile first so Windows uses the hardware encoder. The plain h264
// token is the software encoder, which settles near 22 fps on a busy screen.
const MIMES = [
  "video/x-matroska;codecs=avc1.640028,opus",
  "video/webm;codecs=avc1.640028,opus",
  "video/webm;codecs=h264,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm",
];
const MIC_MIMES = ["audio/webm;codecs=opus", "audio/webm"];
const SYSTEM_AUDIO_BITS = 320_000;

function trace(step: string, detail?: unknown): void {
  const extra = detail instanceof Error
    ? { name: detail.name, message: detail.message, stack: detail.stack?.split("\n")[1]?.trim() }
    : detail;
  console.error(`[replay] ${step}${extra === undefined ? "" : ` ${JSON.stringify(extra)}`}`);
}

function openRecorder(stream: MediaStream, mime: string, videoBits: number, audioBits: number): MediaRecorder {
  return new MediaRecorder(stream, {
    ...(mime ? { mimeType: mime } : {}),
    ...(videoBits > 0 ? { videoBitsPerSecond: videoBits } : {}),
    audioBitsPerSecond: audioBits,
  });
}

function startPictureRecorder(stream: MediaStream, videoBits: number, audioBits: number): MediaRecorder {
  const candidates = MIMES.filter((mime) => MediaRecorder.isTypeSupported(mime));
  if (candidates.length === 0) candidates.push("");
  let last: unknown;
  for (const mime of candidates) {
    try {
      const recorder = openRecorder(stream, mime, videoBits, audioBits);
      recorder.start();
      return recorder;
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("Recording failed.");
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

/**
 * One requestData. A blob with bytes ends the wait. An empty blob means the
 * recorder was already flushed, so it counts once a short follow-up wait ends.
 * A flush that never answers still resolves empty, so Save can finish.
 */
function pullBlob(recorder: MediaRecorder, flushing: boolean): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let emptyWait = 0;
    const finish = (error: Error | null, blob?: Blob): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearTimeout(emptyWait);
      recorder.removeEventListener("dataavailable", onData);
      if (error) reject(error);
      else resolve(blob ?? new Blob());
    };
    const timer = window.setTimeout(() => {
      if (flushing) finish(null, new Blob());
      else finish(new Error("Capture produced no frames."));
    }, flushing ? 5000 : 8000);
    const onData = (event: BlobEvent): void => {
      if (event.data.size > 0) {
        finish(null, event.data);
        return;
      }
      if (emptyWait) return;
      emptyWait = window.setTimeout(() => finish(null, event.data), 500);
    };
    recorder.addEventListener("dataavailable", onData);
    try {
      recorder.requestData();
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Capture produced no frames."));
    }
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
      let voiceStream: MediaStream | null = null;
      let videoRec: MediaRecorder | null = null;
      let sink: HTMLVideoElement | null = null;
      let micRec: MediaRecorder | null = null;
      const release = (): void => {
        if (videoRec && videoRec.state !== "inactive") videoRec.stop();
        if (micRec && micRec.state !== "inactive") micRec.stop();
        display?.getTracks().forEach((track) => track.stop());
        mic?.getTracks().forEach((track) => track.stop());
        mixed?.getTracks().forEach((track) => track.stop());
        voiceStream?.getTracks().forEach((track) => track.stop());
        if (context && context.state !== "closed") void context.close();
        if (sink) {
          sink.pause();
          sink.srcObject = null;
          sink.remove();
          sink = null;
        }
      };
      signal.addEventListener("abort", release, { once: true });
      try {
        const requested = replayDimensions(options.sourceWidth, options.sourceHeight, options.height);
        const openScreen = (withAudio: boolean): Promise<MediaStream> => (
          navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: requested.width },
              height: { ideal: requested.height },
              frameRate: { ideal: options.fps, max: options.fps },
            },
            audio: withAudio ? systemAudioConstraints() : false,
          })
        );
        trace("open-screen", { audio: options.systemAudio, fps: options.fps, height: options.height });
        try {
          display = await openScreen(options.systemAudio);
          trace("open-screen-ok", { tracks: display.getTracks().map((track) => track.kind) });
        } catch (error) {
          trace("open-screen-failed", error);
          if (signal.aborted) throw error;
          await new Promise((resolve) => { window.setTimeout(resolve, 700); });
          if (signal.aborted) throw error;
          try {
            trace("open-screen-retry");
            display = await openScreen(false);
            trace("open-screen-retry-ok", { tracks: display.getTracks().map((track) => track.kind) });
          } catch (retryError) {
            trace("open-screen-retry-failed", retryError);
            throw error;
          }
        }
        if (signal.aborted) return;
        const video = display.getVideoTracks()[0];
        if (!video) throw new Error("No screen to capture.");
        video.addEventListener("ended", () => {
          if (!signal.aborted) {
            window.lumen.replayCaptureFailed("Screen capture ended. Start replay to record again.");
            controller.abort();
          }
        });
        const native = video.getSettings();
        const sized = replayDimensions(
          native.width || requested.width, native.height || requested.height, options.height,
        );
        const constraints: MediaTrackConstraints & { resizeMode: string } = {
          frameRate: { ideal: options.fps, max: options.fps },
          width: { ideal: sized.width, max: sized.width },
          height: { ideal: sized.height, max: sized.height },
          resizeMode: "crop-and-scale",
        };
        try { await video.applyConstraints(constraints); } catch { /* keep the size already opened */ }
        video.contentHint = "motion";
        sink = document.createElement("video");
        sink.muted = true;
        sink.playsInline = true;
        sink.style.cssText = "position:fixed;width:2px;height:2px;opacity:0;pointer-events:none";
        sink.srcObject = new MediaStream([video]);
        document.body.appendChild(sink);
        void sink.play().catch(() => undefined);
        trace("track", { ...video.getSettings(), hint: video.contentHint });
        if (signal.aborted) return;
        const tracks: MediaStreamTrack[] = [video];
        const system = options.systemAudio ? display.getAudioTracks()[0] : undefined;
        if (system) await releaseSystemProcessing(system);
        let micOn = false;
        let voiceTrack: MediaStreamTrack | undefined;
        if (options.mic) {
          try {
            mic = await navigator.mediaDevices.getUserMedia({
              audio: microphoneConstraints(
                options.micDeviceId, options.noiseSuppression, options.echoCancellation,
              ),
              video: false,
            });
            if (signal.aborted) return;
            voiceTrack = mic.getAudioTracks()[0];
            if (!voiceTrack) throw new Error("No microphone.");
            context = new AudioContext({ latencyHint: "interactive" });
            const dest = context.createMediaStreamDestination();
            const voiceGain = context.createGain();
            voiceGain.gain.value = options.micGain;
            const source = context.createMediaStreamSource(new MediaStream([voiceTrack]));
            const node = options.micHum ? humFilter(context, source) : source;
            node.connect(voiceGain).connect(dest);
            if (system) {
              const desktop = context.createGain();
              desktop.gain.value = options.systemGain;
              const desktopIn = context.createMediaStreamSource(new MediaStream([system]));
              desktopIn.connect(desktop).connect(dest);
            }
            await context.resume();
            tracks.push(dest.stream.getAudioTracks()[0]);
            micOn = true;
          } catch {
            if (signal.aborted) return;
            if (context && context.state !== "closed") void context.close();
            context = null;
            if (voiceTrack) {
              voiceStream = new MediaStream([voiceTrack]);
              micOn = true;
            }
          }
        }
        if (system && !micOn) tracks.push(system);
        if (signal.aborted) return;
        const micMime = MIC_MIMES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
        mixed = new MediaStream(tracks);
        videoRec = startPictureRecorder(mixed, options.bitrateKbps * 1000, SYSTEM_AUDIO_BITS);
        const mime = videoRec.mimeType;
        trace("recorder", { mime });
        const videoMark = performance.now();
        if (voiceStream) micRec = openRecorder(voiceStream, micMime, 0, 128_000);
        micRec?.start();
        const micMark = performance.now();
        const micLeadMs = micRec ? micMark - videoMark : 0;
        const actual = video.getSettings();
        window.lumen.replayCaptureReady({
          sessionId: options.sessionId,
          width: actual.width || sized.width,
          height: actual.height || sized.height,
          audio: Boolean(system),
          mic: micOn,
          codec: mime || "webm",
        });
        let lastCut = performance.now();
        let videoHeaderSent = false;
        let micHeaderSent = false;
        let videoClusterMs = 0;
        let micClusterMs = 0;
        let chain: Promise<void> = Promise.resolve();
        let timer = 0;
        const fail = (error: unknown): void => {
          if (!signal.aborted) {
            trace("cut-failed", error);
            window.lumen.replayCaptureFailed(error instanceof Error ? error.message : "Replay failed.");
          }
          controller.abort();
        };
        const sendCut = async (): Promise<void> => {
          if (signal.aborted || !videoRec) return;
          const id = flushId;
          flushId = undefined;
          const startedAt = performance.timeOrigin + lastCut;
          const pictureBlob = await pullBlob(videoRec, Boolean(id));
          if (signal.aborted) return;
          if (!pictureBlob.size) {
            if (id) {
              await window.lumen.replaySegment({
                sessionId: options.sessionId,
                bytes: new Uint8Array(),
                duration: 0.001,
                startedAt,
                endedAt: performance.timeOrigin + performance.now(),
                flushId: id,
              });
            }
            return;
          }
          const voiceBlob = micRec ? await pullBlob(micRec, Boolean(id)) : null;
          const endedAt = performance.timeOrigin + performance.now();
          lastCut = performance.now();
          if (signal.aborted) return;
          const picture = splitWebmChunk(new Uint8Array(await pictureBlob.arrayBuffer()), videoClusterMs);
          if (!picture) throw new Error("Capture produced an unreadable segment.");
          videoClusterMs = picture.clusterMs;
          const headerBytes = !videoHeaderSent && picture.init ? copyBytes(picture.init) : undefined;
          if (headerBytes) videoHeaderSent = true;
          let micBytes: Uint8Array | undefined;
          let micHeaderBytes: Uint8Array | undefined;
          if (voiceBlob && voiceBlob.size > 0) {
            const voice = splitWebmChunk(
              new Uint8Array(await voiceBlob.arrayBuffer()),
              micClusterMs,
            );
            if (!voice) throw new Error("Microphone produced an unreadable segment.");
            micClusterMs = voice.clusterMs;
            micHeaderBytes = !micHeaderSent && voice.init ? copyBytes(voice.init) : undefined;
            if (micHeaderBytes) micHeaderSent = true;
            micBytes = copyBytes(voice.cluster);
          }
          trace("segment", { bytes: picture.cluster.byteLength, mic: micBytes?.byteLength ?? 0 });
          await window.lumen.replaySegment({
            sessionId: options.sessionId,
            bytes: copyBytes(picture.cluster),
            ...(headerBytes ? { headerBytes } : {}),
            ...(micBytes && micBytes.byteLength > 0 ? { micBytes } : {}),
            ...(micHeaderBytes ? { micHeaderBytes } : {}),
            micLeadMs,
            cluster: true,
            duration: Math.max(0.001, (endedAt - startedAt) / 1000),
            startedAt,
            endedAt,
            flushId: id,
          });
        };
        const enqueue = (): Promise<void> => {
          const runCut = chain.then(sendCut);
          chain = runCut.catch((error) => fail(error));
          return runCut;
        };
        const armTimer = (): void => {
          window.clearTimeout(timer);
          if (signal.aborted) return;
          timer = window.setTimeout(() => {
            void enqueue().finally(armTimer);
          }, REPLAY_SEGMENT_SECONDS * 1000);
        };
        if (active === controller) stopSlice = () => {
          window.clearTimeout(timer);
          void enqueue().finally(armTimer);
        };
        videoRec.onerror = () => fail(new Error("Recording failed."));
        if (micRec) micRec.onerror = () => fail(new Error("Microphone recording failed."));
        armTimer();
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener("abort", () => resolve(), { once: true });
        });
        window.clearTimeout(timer);
      } catch (error) {
        if (!signal.aborted) {
          window.lumen.replayCaptureFailed(error instanceof Error ? error.message : "Replay failed.");
        }
      } finally {
        controller.abort();
        release();
        signal.removeEventListener("abort", release);
        if (active === controller) { active = null; stopSlice = null; }
      }
    };
    const offStart = window.lumen.onReplayCaptureStart((options) => { flushId = undefined; void run(options); });
    const offStop = window.lumen.onReplayCaptureStop(() => { active?.abort(); active = null; stopSlice = null; });
    const offFlush = window.lumen.onReplayCaptureFlush((id) => {
      if (active) { flushId = id; stopSlice?.(); }
      else {
        void window.lumen.replaySegment({
          sessionId, bytes: new Uint8Array(), duration: 0, startedAt: 0, endedAt: 0, flushId: id,
        });
      }
    });
    window.lumen.replayCaptureMounted();
    let outputKey = "";
    let quietUntil = 0;
    const watchOutput = async (): Promise<void> => {
      if (Date.now() < quietUntil) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const output = devices.find((item) => (
          item.kind === "audiooutput" && item.deviceId === "default"
        ));
        const next = output ? `${output.groupId}\n${output.label}` : "";
        if (!next) return;
        if (!outputKey) {
          outputKey = next;
          return;
        }
        if (next === outputKey) return;
        outputKey = next;
        quietUntil = Date.now() + 4000;
        await window.lumen.replayRebindAudio();
      } catch (error) {
        console.error("[replay] output device", error);
      }
    };
    const onDevices = (): void => { void watchOutput(); };
    navigator.mediaDevices.addEventListener("devicechange", onDevices);
    const outputTimer = window.setInterval(() => { void watchOutput(); }, 2000);
    void watchOutput();
    return () => {
      active?.abort();
      offStart();
      offStop();
      offFlush();
      navigator.mediaDevices.removeEventListener("devicechange", onDevices);
      window.clearInterval(outputTimer);
    };
  }, []);
  return null;
}
