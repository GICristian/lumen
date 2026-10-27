import { resolveMicrophone } from "@shared/replay";

/** Loopback must be opened as stereo music. A bare `audio: true` is a voice mic. */
export function systemAudioConstraints(): MediaTrackConstraints {
  return {
    channelCount: { ideal: 2 },
    sampleRate: { ideal: 48000 },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
}

/** The preview and recorder must request the same unboosted microphone signal. */
export function microphoneConstraints(deviceId: string, noiseSuppression: boolean, echoCancellation: boolean): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    noiseSuppression, echoCancellation, autoGainControl: false,
  };
}

/** Desktop loopback must stay a raw stereo feed, never a processed mic. */
export async function releaseSystemProcessing(track: MediaStreamTrack): Promise<void> {
  const clean: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  try {
    await track.applyConstraints(clean);
  } catch {
    // Some loopback tracks reject constraints and are already unprocessed.
  }
  try {
    await track.applyConstraints({ ...clean, channelCount: 2 });
  } catch {
    // A mono endpoint cannot be widened; the request already asked for stereo.
  }
  track.contentHint = "music";
}

async function audioInputs(): Promise<MediaDeviceInfo[]> {
  const listed = await navigator.mediaDevices.enumerateDevices();
  return listed.filter((item) => item.kind === "audioinput");
}

function identified(
  stream: MediaStream,
  devices: MediaDeviceInfo[],
  chosen: { deviceId: string; label: string },
): { stream: MediaStream; deviceId: string; label: string } {
  const trackId = stream.getAudioTracks()[0]?.getSettings().deviceId || chosen.deviceId;
  const named = devices.find((device) => device.deviceId === trackId);
  return {
    stream,
    deviceId: trackId,
    label: named?.label.trim() || chosen.label,
  };
}

/**
 * Opens the saved microphone. A changed Chromium id is followed by the saved label
 * instead of falling back to whichever device is the new default.
 */
export async function openSavedMicrophone(
  deviceId: string,
  label: string,
  noiseSuppression: boolean,
  echoCancellation: boolean,
): Promise<{ stream: MediaStream; deviceId: string; label: string }> {
  const open = (id: string): Promise<MediaStream> => navigator.mediaDevices.getUserMedia({
    audio: microphoneConstraints(id, noiseSuppression, echoCancellation),
    video: false,
  });
  let devices = await audioInputs().catch(() => [] as MediaDeviceInfo[]);
  let chosen = resolveMicrophone(devices, deviceId, label);
  try {
    return identified(await open(chosen.deviceId), devices, chosen);
  } catch (error) {
    if (!label.trim()) throw error;
    let probe: MediaStream | null = null;
    try {
      probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      throw error;
    } finally {
      probe?.getTracks().forEach((track) => track.stop());
    }
    devices = await audioInputs().catch(() => devices);
    chosen = resolveMicrophone(devices, deviceId, label);
    if (!chosen.deviceId || chosen.deviceId === deviceId) throw error;
    return identified(await open(chosen.deviceId), devices, chosen);
  }
}

/** Cut mains hum and its first harmonic. Voice stays; the buzz does not. */
export function humFilter(context: AudioContext, source: AudioNode): AudioNode {
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 80;
  highpass.Q.value = 0.7;
  const fundamental = context.createBiquadFilter();
  fundamental.type = "notch";
  fundamental.frequency.value = 50;
  fundamental.Q.value = 10;
  const harmonic = context.createBiquadFilter();
  harmonic.type = "notch";
  harmonic.frequency.value = 100;
  harmonic.Q.value = 10;
  source.connect(highpass).connect(fundamental).connect(harmonic);
  return harmonic;
}

export function audioLimiter(context: AudioContext): DynamicsCompressorNode {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.05;
  return limiter;
}
