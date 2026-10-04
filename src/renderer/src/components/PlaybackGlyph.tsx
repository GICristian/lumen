export function PlaybackGlyph({ playing }: { playing: boolean }) {
  return <svg className={`playback-glyph${playing ? " is-playing" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
    <path className="glyph-play" d="M8 5.5 19 12 8 18.5Z" fill="currentColor" />
    <g className="glyph-pause" fill="currentColor"><rect x="6.5" y="5.5" width="4" height="13" rx="1" /><rect x="13.5" y="5.5" width="4" height="13" rx="1" /></g>
  </svg>;
}
