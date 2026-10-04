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

// H.264 first; VP8 avoids the considerably heavier VP9 fallback on many systems.
const MIMES = ["video/webm;codecs=h264,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
const MIC_MIMES = ["audio/webm;codecs=opus", "audio/webm"];
const SYSTEM_AUDIO_BITS = 320_000;

function openRecorder(stream: MediaStream, mime: string, videoBits: number, audioBits: number): MediaRecorder {
  return new MediaRecorder(stream, {
    ...(mime ? { mimeType: mime } : {}),
    ...(videoBits > 0 ? { videoBitsPerSecond: videoBits } : {}),
    audioBitsPerSecond: audioBits,
  });
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

/** One requestData, one blob. The recorder itself is never stopped between slices. */
function pullBlob(recorder: MediaRecorder): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      recorder.removeEventListener("dataavailable", onData);
      reject(new Error("Capture stalled."));
    }, 5000);
    const onData = (event: BlobEvent): void => {
      if (!event.data.size) return;
      window.clearTimeout(timer);
      recorder.removeEventListener("dataavailable", onData);
      resolve(event.data);
    };
    recorder.addEventListener("dataavailable", onData);
    try {
      recorder.requestData();
    } catch (error) {
      window.clearTimeout(timer);
      recorder.removeEventListener("dataavailable", onData);
      reject(error);
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
      let micRec: MediaRecorder | null = null;
      const release = (): void => {
        if (videoRec && videoRec.state !== "inactive") videoRec.stop();
        if (micRec && micRec.state !== "inactive") micRec.stop();
        display?.getTracks().forEach((track) => track.stop());
        mic?.getTracks().forEach((track) => track.stop());
        mixed?.getTracks().forEach((track) => track.stop());
        voiceStream?.getTracks().forEach((track) => track.stop());
        if (context && context.state !== "closed") void context.close();
      };
      signal.addEventListener("abort", release, { once: true });
      try {
        const requested = replayDimensions(options.sourceWidth, options.sourceHeight, options.height);
        display = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: requested.width },
            height: { ideal: requested.height },
            frameRate: options.fps,
          },
          audio: options.systemAudio ? systemAudioConstraints() : false,
        });
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
        await video.applyConstraints(constraints);
        video.contentHint = "motion";
        if (signal.aborted) return;
        const tracks: MediaStreamTrack[] = [video];
        const system = options.systemAudio ? display.getAudioTracks()[0] : undefined;
        if (system) {
          await releaseSystemProcessing(system);
          tracks.push(system);
        }
        let micOn = false;
        if (options.mic) {
          try {
            mic = await navigator.mediaDevices.getUserMedia({
              audio: microphoneConstraints(
                options.micDeviceId, options.noiseSuppression, options.echoCancellation,
              ),
              video: false,
            });
            if (signal.aborted) return;
            let voiceTrack = mic.getAudioTracks()[0];
            if (!voiceTrack) throw new Error("No microphone.");
            if (system) {
              if (options.micHum) {
                context = new AudioContext({ latencyHint: "interactive" });
                const dest = context.createMediaStreamDestination();
                humFilter(context, context.createMediaStreamSource(mic)).connect(dest);
                await context.resume();
                voiceTrack = dest.stream.getAudioTracks()[0];
              }
              voiceStream = new MediaStream([voiceTrack]);
              micOn = true;
            } else {
              context = new AudioContext({ latencyHint: "interactive" });
              const dest = context.createMediaStreamDestination();
              const gain = context.createGain();
              gain.gain.value = options.micGain;
              let node: AudioNode = context.createMediaStreamSource(mic);
              if (options.micHum) node = humFilter(context, node);
              node.connect(gain).connect(dest);
              await context.resume();
              tracks.push(dest.stream.getAudioTracks()[0]);
              micOn = true;
            }
          } catch { if (signal.aborted) return; }
        }
        if (signal.aborted) return;
        const mime = MIMES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
        const micMime = MIC_MIMES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
        mixed = new MediaStream(tracks);
        videoRec = openRecorder(mixed, mime, options.bitrateKbps * 1000, SYSTEM_AUDIO_BITS);
        if (voiceStream) micRec = openRecorder(voiceStream, micMime, 0, 128_000);
        videoRec.start();
        const videoMark = performance.now();
        micRec?.start();
        const micMark = performance.now();
        const latencyMs = context && voiceStream
          ? (context.baseLatency + context.outputLatency) * 1000 : 0;
        const micLeadMs = micRec ? (micMark - videoMark) - latencyMs : 0;
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
        let chain: Promise<void> = Promise.resolve();
        let timer = 0;
        const fail = (error: unknown): void => {
          if (!signal.aborted) {
            window.lumen.replayCaptureFailed(error instanceof Error ? error.message : "Replay failed.");
          }
          controller.abort();
        };
        const sendCut = async (): Promise<void> => {
          if (signal.aborted || !videoRec) return;
          const id = flushId;
          flushId = undefined;
          const startedAt = performance.timeOrigin + lastCut;
          const pictureBlob = await pullBlob(videoRec);
          const voiceBlob = micRec ? await pullBlob(micRec) : null;
          const endedAt = performance.timeOrigin + performance.now();
          lastCut = performance.now();
          if (signal.aborted) return;
          const picture = splitWebmChunk(new Uint8Array(await pictureBlob.arrayBuffer()));
          if (!picture) throw new Error("Capture produced an unreadable segment.");
          const headerBytes = !videoHeaderSent && picture.init ? copyBytes(picture.init) : undefined;
          if (headerBytes) videoHeaderSent = true;
          let micBytes: Uint8Array | undefined;
          let micHeaderBytes: Uint8Array | undefined;
          if (voiceBlob) {
            const voice = splitWebmChunk(new Uint8Array(await voiceBlob.arrayBuffer()));
            if (!voice) throw new Error("Microphone produced an unreadable segment.");
            micHeaderBytes = !micHeaderSent && voice.init ? copyBytes(voice.init) : undefined;
            if (micHeaderBytes) micHeaderSent = true;
            micBytes = copyBytes(voice.cluster);
          }
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
    return () => { active?.abort(); offStart(); offStop(); offFlush(); };
  }, []);
  return null;
}
