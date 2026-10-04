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
