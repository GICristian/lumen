/** The preview and recorder must request the same unboosted microphone signal. */
export function microphoneConstraints(deviceId: string, noiseSuppression: boolean, echoCancellation: boolean): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    noiseSuppression, echoCancellation, autoGainControl: false,
  };
}

export function audioLimiter(context: AudioContext): DynamicsCompressorNode {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 6;
  limiter.ratio.value = 20;
  limiter.attack.value = .003;
  limiter.release.value = .15;
  return limiter;
}
