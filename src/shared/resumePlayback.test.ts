import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isPlaybackRecovery, pausePlayback, resumePlayback } from '../renderer/src/player/resumePlayback';

class Media extends EventTarget {
  currentSrc = 'lumen://media/clip.mp4'; src = this.currentSrc;
  isConnected = true; currentTime = 17; duration = 90;
  volume = .65; playbackRate = 1.5; muted = false;
  paused = true; ended = false; autoplay = true; error: object | null = null;
  play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event('pause')); });
  load = vi.fn(() => { this.pause(); this.currentTime = 0; this.volume = 1; this.playbackRate = 1; this.error = null; });
  get element() { return this as unknown as HTMLMediaElement; }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('document', { hidden: false }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('does not reload when the media clock advances normally', async () => {
  const media = new Media(), failed = vi.fn();
  resumePlayback(media.element, failed); media.currentTime += 1;
  await vi.advanceTimersByTimeAsync(8000);
  expect(media.load).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
});

it('reloads a stalled decoder once and preserves position, volume and speed', async () => {
  const media = new Media(), failed = vi.fn();
  resumePlayback(media.element, failed);
  await vi.advanceTimersByTimeAsync(2500);
  expect(media.load).toHaveBeenCalledTimes(1);
  expect(isPlaybackRecovery(media.element)).toBe(true);
  media.dispatchEvent(new Event('loadedmetadata'));
  await vi.advanceTimersByTimeAsync(8000);
  expect(media.currentTime).toBe(17); expect(media.volume).toBe(.65); expect(media.playbackRate).toBe(1.5);
  expect(media.play).toHaveBeenCalledTimes(2); expect(failed).not.toHaveBeenCalled();
});

it('a user pause during recovery wins over a late metadata event', async () => {
  const media = new Media(), failed = vi.fn();
  resumePlayback(media.element, failed);
  await vi.advanceTimersByTimeAsync(2500);
  pausePlayback(media.element);
  media.dispatchEvent(new Event('loadedmetadata'));
  await vi.advanceTimersByTimeAsync(8000);
  expect(media.autoplay).toBe(false); expect(media.paused).toBe(true);
  expect(media.play).toHaveBeenCalledTimes(1); expect(failed).not.toHaveBeenCalled();
});

it('rapid pause/play cancels old attempts, and changing clip never reloads the new source', async () => {
  const media = new Media(), failed = vi.fn();
  resumePlayback(media.element, failed); pausePlayback(media.element);
  resumePlayback(media.element, failed); media.currentSrc = 'lumen://media/other.mp4';
  await vi.advanceTimersByTimeAsync(8000);
  expect(media.load).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
});

it('reports a failed recovery once and stops playback instead of looping', async () => {
  const media = new Media(), failed = vi.fn(); media.error = {};
  resumePlayback(media.element, failed);
  await vi.advanceTimersByTimeAsync(12000);
  expect(media.load).toHaveBeenCalledTimes(1); expect(failed).toHaveBeenCalledTimes(1);
  expect(media.paused).toBe(true);
});

