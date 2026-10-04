import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) throw new Error("Root missing");

const overlay = window.location.hash.startsWith("#/overlay");
const replayToast = window.location.hash.startsWith("#/replay-toast");
const replayCapture = window.location.hash.startsWith("#/replay-capture");
const replayPill = window.location.hash.startsWith("#/replay-pill");
if (overlay) document.documentElement.classList.add("is-overlay");
if (replayPill) document.documentElement.classList.add("is-replay-pill");

async function boot(): Promise<void> {
  // The always-running capture host does not need the player, library, fonts or CSS.
  if (!replayCapture) {
    await Promise.all([import('@fontsource/outfit/400.css'), import('@fontsource/outfit/500.css'), import('@fontsource/outfit/600.css'), import('./styles.css')]);
    await import('./studio.css');
  }
  const Component = replayCapture ? (await import('./components/ReplayCapture')).ReplayCapture
    : replayPill ? (await import('./components/ReplayPill')).ReplayPill
      : replayToast ? (await import('./components/ReplayToast')).ReplayToast
        : overlay ? (await import('./components/Overlay')).OverlayApp : (await import('./App')).App;
  createRoot(root!).render(<StrictMode><Component /></StrictMode>);
}
void boot();
