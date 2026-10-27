import type { Settings } from "@shared/contracts";
import { headsetOutput } from "@shared/plugins";
import { mediaUrl } from "./usePlayback";

type SinkContext = AudioContext & {
  setSinkId?: (id: string) => Promise<void>;
};

let preview: AudioContext | null = null;
let built = "";
let generation = 0;
let tail: Promise<void> = Promise.resolve();

function clamp(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(1, Math.max(0, level));
}

function later(job: () => Promise<void>): Promise<void> {
  const run = tail.then(job, job);
  tail = run.then(() => undefined, () => undefined);
  return run;
}

async function openContext(sinkId: string): Promise<AudioContext> {
  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
  } catch {
    context = new AudioContext({ latencyHint: "interactive" });
  }
  const sink = context as SinkContext;
  if (!sink.setSinkId) {
    await context.close().catch(() => undefined);
    throw new Error("audio output selection is unavailable");
  }
  await context.resume();
  await sink.setSinkId(sinkId);
  return context;
}

async function releasePreview(): Promise<void> {
  const local = preview;
  preview = null;
  built = "";
  if (local && local.state !== "closed") await local.close().catch(() => undefined);
}

async function listOutputs(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "audiooutput");
}

function startDry(context: AudioContext, buffer: AudioBuffer, volume: number): void {
  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(gain).connect(context.destination);
  void context.resume();
  source.start();
}

async function buildHeadset(ticket: number): Promise<void> {
  await releasePreview();
  if (ticket !== generation) return;
  const outputs = await listOutputs();
  if (ticket !== generation) return;
  const headsetSink = outputs.find((device) => headsetOutput(device.label))?.deviceId ?? "";
  if (!headsetSink) {
    console.error("soundboard headset was not found");
    return;
  }
  preview = await openContext(headsetSink);
  built = "headset";
}

/** Opens the headset output only. Never touches the microphone or the voice cable. */
export function syncSoundboardVoice(settings: Settings): Promise<void> {
  const ticket = ++generation;
  return later(async () => {
    if (ticket !== generation) return;
    if (!settings.soundboardEnabled || !settings.soundboardMonitor) {
      await releasePreview();
      return;
    }
    if (built === "headset" && preview && preview.state !== "closed") return;
    try {
      await buildHeadset(ticket);
    } catch (error) {
      console.error("soundboard voice", error);
    }
  });
}

/** Plays the effect on the headset. Discord keeps using the real microphone alone. */
export function playSoundboard(filePath: string, level: number): void {
  const volume = clamp(level);
  void play(filePath, volume);
}

async function play(filePath: string, volume: number): Promise<void> {
  try {
    const response = await fetch(mediaUrl(filePath));
    if (!response.ok) return;
    const bytes = await response.arrayBuffer();
    const local = preview;
    if (!local || local.state === "closed") return;
    const buffer = await local.decodeAudioData(bytes.slice(0));
    if (preview === local) startDry(local, buffer, volume);
  } catch (error) {
    console.error("soundboard play", error);
  }
}

export function stopSoundboardVoice(): Promise<void> {
  generation += 1;
  return later(async () => {
    await releasePreview();
  });
}
