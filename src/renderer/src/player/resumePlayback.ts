type Attempt = { cancel: () => void };
const pending = new WeakMap<HTMLMediaElement, Attempt>();
const reloading = new WeakSet<HTMLMediaElement>();

/** A decoder reload must not trigger the stage's initial-file autoplay handler. */
export function isPlaybackRecovery(media: HTMLMediaElement): boolean { return reloading.has(media); }

export function pausePlayback(media: HTMLMediaElement): void {
  pending.get(media)?.cancel();
  media.pause();
}

/** Resume once, then recover a stalled decoder at the same position. No retry loop. */
export function resumePlayback(media: HTMLMediaElement, onFailure: () => void): void {
  pending.get(media)?.cancel();
  const source = media.currentSrc || media.src;
  let cancelled = false, recovered = false;
  let watch: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let metadata: (() => void) | undefined;
  const cleanup = (): void => {
    clearTimeout(watch); clearTimeout(deadline);
    if (metadata) media.removeEventListener('loadedmetadata', metadata);
    media.removeEventListener('error', failed);
    media.removeEventListener('pause', paused);
    if (pending.get(media) === attempt) pending.delete(media);
  };
  const attempt: Attempt = { cancel: () => { cancelled = true; cleanup(); } };
  const live = (): boolean => !cancelled && (media.currentSrc || media.src) === source && media.isConnected;
  const failed = (): void => { if (!live()) return; cleanup(); cancelled = true; media.pause(); onFailure(); };
  const paused = (): void => { if (!recovered) attempt.cancel(); };
  const recover = (): void => {
    if (!live() || recovered || document.hidden) return;
    recovered = true; clearTimeout(watch);
    const position = media.ended ? 0 : media.currentTime;
    const volume = media.volume, rate = media.playbackRate, muted = media.muted;
    // Explicit resume owns this reload; a later Pause must always win.
    media.autoplay = false;
    reloading.add(media);
    metadata = () => {
      if (!live()) return;
      media.volume = volume; media.playbackRate = rate; media.muted = muted;
      media.currentTime = Number.isFinite(media.duration) ? Math.min(position, Math.max(0, media.duration - .001)) : position;
      void media.play().then(() => { if (live()) cleanup(); }, () => { if (live()) failed(); });
    };
    media.addEventListener('loadedmetadata', metadata, { once: true });
    media.addEventListener('error', failed, { once: true });
    deadline = setTimeout(failed, 6000);
    media.load();
  };
  pending.set(media, attempt);
  media.addEventListener('pause', paused);
  const start = media.ended ? 0 : media.currentTime;
  if (media.ended) media.currentTime = 0;
  watch = setTimeout(() => {
    if (!live() || media.paused || media.ended || document.hidden) { attempt.cancel(); return; }
    if (Math.abs(media.currentTime - start) > .04) cleanup();
    else recover();
  }, 2500);
  if (media.error) recover();
  else void media.play().catch((error: unknown) => {
    if (!live()) return;
    if (error instanceof DOMException && error.name === 'AbortError') { attempt.cancel(); return; }
    recover();
  });
}
