/** Always-on recording chip. A click opens the overlay without toggling it shut. */
export function ReplayPill() {
  return (
    <button
      type="button"
      className="replay-pill"
      aria-label="Recording, open overlay"
      onClick={() => window.lumen.openOverlay()}
    >
      <i />
      <span>Rec</span>
    </button>
  );
}
