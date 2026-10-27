import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) throw new Error("Root missing");

const overlay = window.location.hash.startsWith("#/overlay");
const replayToast = window.location.hash.startsWith("#/replay-toast");
const replayCapture = window.location.hash.startsWith("#/replay-capture");
const replayPill = window.location.hash.startsWith("#/replay-pill");
const screenshot = window.location.hash.startsWith("#/screenshot");
const soundboard = window.location.hash.startsWith("#/soundboard");
const macro = window.location.hash.startsWith("#/macro");
const perfSetup = window.location.hash.startsWith("#/perf-setup");
const perf = window.location.hash.startsWith("#/perf") && !perfSetup;
const clicker = window.location.hash.startsWith("#/clicker");
if (overlay) document.documentElement.classList.add("is-overlay");
if (soundboard) document.documentElement.classList.add("is-soundboard");
if (macro) document.documentElement.classList.add("is-macro");
if (perfSetup) document.documentElement.classList.add("is-perf-setup");
if (perf) document.documentElement.classList.add("is-perf");
if (clicker) document.documentElement.classList.add("is-clicker");
if (replayPill) document.documentElement.classList.add("is-replay-pill");

async function boot(): Promise<void> {
  // The always-running capture host does not need the player, library, fonts or CSS.
  if (!replayCapture) {
    await Promise.all([import('@fontsource/outfit/400.css'), import('@fontsource/outfit/500.css'), import('@fontsource/outfit/600.css'), import('./styles.css')]);
    await import('./studio.css');
    await import('./experience.css');
    const { applyTheme } = await import('./player/applyTheme');
    const { bindPreviewAudio } = await import('./player/previewAudio');
    const settings = await window.lumen.getSettings();
    applyTheme(settings);
    bindPreviewAudio();
    window.lumen.onTheme(applyTheme);
  }
  const Component = replayCapture ? (await import('./components/ReplayCapture')).ReplayCapture
    : replayPill ? (await import('./components/ReplayPill')).ReplayPill
      : replayToast ? (await import('./components/ReplayToast')).ReplayToast
        : screenshot ? (await import('./components/ScreenshotSelect')).ScreenshotSelect
          : soundboard ? (await import('./components/SoundboardWheel')).SoundboardWheel
            : macro ? (await import('./components/MacroEditor')).MacroEditor
              : perfSetup ? (await import('./components/PerfSetup')).PerfSetup
                : perf ? (await import('./components/PerfOverlay')).PerfOverlay
                  : clicker ? (await import('./components/ClickerSetup')).ClickerSetup
                    : overlay ? (await import('./components/Overlay')).OverlayApp : (await import('./App')).App;
  createRoot(root!).render(<StrictMode><Component /></StrictMode>);
}
void boot();
