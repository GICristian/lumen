# Lumen interface refinement

## Existing architecture and workflows

The Electron main process owns local media, native windows, settings, FFmpeg exports,
subtitles and the vault. React's `App` coordinates the player; `VideoStage` owns the
picture, zoom, pan and crop overlay; `Timeline` owns seeking; `Transport` owns
playback controls and `PlayerSettings`. `OverlayDetail` is the shared studio used
by the main window and desktop overlay. The library, quick preview, preferences
and vault remain separate views. The replay additions already being developed in
the workspace are retained.

Inspected states include the empty hub, folder browsing, selected and current clips,
playing/paused media, automatic chrome fade, zoom/pan, seeking and A/B marks,
fullscreen, proxy preparation, playback failure, subtitle loading/synchronization,
crop and trim editing, export progress/cancel/completion, and locked vault.

The old presentation layered cool cyan and warm gold styling, repeated gradients,
glows and differently rounded panels. Controls and metadata used inconsistent
sizes. Hovering the library resized the picture. The main timeline lacked keyboard
semantics and drag cancellation. Focused sliders could trigger global seeking;
studio shortcuts could also reach the background player. Loading could momentarily
look like failure. The studio dock covered lower crop handles. Quick preview lost
its explicit play button after pausing.

## Visual system

`studio.css` is the final presentation layer over existing layout primitives.
Ink-black picture space, restrained warm brass, neutral raised surfaces, fine frame
corners and the existing Lumen mark establish the Picture House identity. Outfit
is reserved for brand/headings; system text and tabular time readouts keep tools
compact and readable. The home tool directory preserves every entry point.

The library reserves picture space both on hover and when pinned; pointer focus does not keep the unpinned rail open.
The stage stays black, transport stays outside the picture in windowed mode, and
fullscreen uses a bottom contrast scrim. Studio controls now sit below its picture,
so crop handles remain available. Preferences, overlay and vault share the palette.

## Interaction changes

- Shared volume control: percentage readout, continuous level fill, animated mute,
  and restoration of the last audible volume in each view.
- Direct previous/next clip and loop controls; animated play/pause glyphs;
  accessible names, selected states and delayed shortcut tooltips.
- Timeline: 28px interaction area, edge-clamped video previews, six-pixel snapping
  to boundaries/marks, Shift-drag at one-tenth sensitivity, keyboard seeking,
  and pointer cancellation cleanup. Preview decoding stays debounced.
- Explicit preparation/buffering feedback, volume meters, playback and fullscreen
  feedback. Escape dismisses player settings and restores trigger focus.
- Focused inputs and studio shortcuts are isolated from background player keys.
  Keyboard focus and active scrubbing keep controls visible. Mouse focus alone
  does not permanently prevent cinema mode.
- Export displays an actual progress element and a separately labeled Cancel
  action. Quick preview has explicit play and pause controls.
- Short press compression and icon transitions respect reduced motion. Continuous
  decorative animations and most blur/shadow effects were removed.

## Performance and preservation

No runtime dependencies, replacement playback engine, network assets or mock API
were added to the application. IPC, media URLs, FFmpeg requests, subtitles, vault,
selection/deletion and native window operations remain connected to the existing
backend. Thumbnail generation now follows the library's visibility observer,
instead of eagerly queuing the entire folder. Its existing two-worker limit remains.
Pointer light response changes CSS variables locally; time-preview updates stay
inside the timeline component. Timers and pointer listeners are cleaned up.

## Validation

- TypeScript checks and Electron production build.
- 100 tests across 28 suites, including real FFmpeg trim/crop integration and new
  timeline snapping boundary tests.
- Browser interaction checks with real generated video and a test-only IPC fixture:
  home, loading, playback, picture resizing during library expansion and pointer exit after selection, mute
  restoration, native slider keyboard isolation, keyboard/fine seeking, settings,
  fullscreen layout and Escape, buffering, crop/trim/export request/progress,
  preferences, vault gate, desktop overlay and quick-preview pause/resume.
- Rendered screenshots at 1440×900, 800×600 and 640×560; reduced-motion check.

Browser fixtures and screenshots are outside production source. Browser testing
does not validate native OS fullscreen transitions, global shortcuts, desktop capture,
file dialogs or every subtitle provider. Those native integrations were preserved;
they were not exercised by the browser fixture.


## Replay and daylight refinement

Replay settings now provide a 10–900 second duration in single-second steps, target bitrate (2–30 Mbps), resolution and frame rate, microphone selection and signal test, independent 0–200% source levels, system sound, optional noise suppression and echo cancellation. Changes are staged and applied together; changing picture/audio settings explicitly starts a fresh buffer. The panel shows actual capture dimensions, buffered duration and disk usage. Automatic replay is enabled by default when Lumen starts, with Windows sign-in launch exposed separately.

A non-activating topmost notification shows saving, success and failure above the current app. Its primary saved action opens the actual file in the overlay. Output is published only after FFmpeg completes. The fast path preserves encoded video and converts audio to AAC for MP4 compatibility; a video encode fallback remains. Save requests are coalesced while busy and include the current partial recording segment.

Each capture owns a separate session directory. Late writes cannot enter a new recording, files involved in a save are protected from pruning, interrupted-session files are reclaimed at the next start, and pruning uses durations instead of directory scans. Recording restarts before awaiting a bounded disk write. Hidden recording does not use UI polling; stopping releases capture, microphone, audio graph and hidden window. No hardware-encoder guarantee is made: encoder selection and actual load depend on Chromium and the machine.

The source is sized using the selected screen dimensions and its aspect ratio, with actual output dimensions reported by the capture track. High-DPI, ultrawide and portrait size calculations have unit coverage. Saves retain complete four-second segments plus the finalized tail and can exceed the configured duration by one segment.

The desktop overlay defaults to 960×640, bounded by the current work area, and reasserts topmost/foreground placement on open. Quick Look has a full-width seek row, time hover, keyboard playback/seeking/volume shortcuts, and a visible volume OSD. Library hover now reserves picture space; only keyboard-visible focus keeps it expanded after pointer exit. Graphite surface planes and brighter labels replace nearly black secondary surfaces.

Replay verification includes real filesystem race/protection tests; a main-process IPC integration fixture driving auto-start, partial flush, real FFmpeg save/decode, restart and Open in overlay; and real Chromium MediaRecorder encoding a synthetic 1280×720 source with audio. Browser checks cover microphone test cleanup, device/gain/duration settings, sidebar geometry, preview seeking, volume feedback and 640×480 layouts. Native desktop recording under game load, exclusive fullscreen stacking and physical microphone hardware still require testing on the target Windows machine.


## Golden Ribbon revision

The user-supplied LUMEN Golden Ribbon Emblem is now the source of the lockup, standalone app mark, nine-resolution Windows icon and registered video-file icon. The original PNG is retained at src/renderer/src/assets/lumen-golden-original.png. No generated replacement logo is used. Emblem exports are cropped/resized only; the supplied shape and colors are preserved. File-association icons are packaged by the NSIS installer; Windows still controls the default video application.

The palette now uses warm charcoal and champagne rather than the earlier blue-gray daylight surfaces. Replay is a dedicated capture console: retained-time readout and buffer meter stay separate from Capture, Audio and Save/startup tabs. Each tab has its own scrollable pane, while Save and Apply remain accessible. All popup descendants explicitly opt out of the native title-bar drag region, fixing mouse-wheel scrolling in the overlay. Visible scroll cues and 640×480 checks cover discovery and constrained layouts.

Save now freezes the button/hotkey timestamp before queueing any work. Existing files are held while the latest segment flushes; snapshots exclude later segments and shorten any segment overlapping the cutoff. An explicit FFmpeg output-duration limit prevents disk/IPC delay from extending the saved clip. The WebM Info duration is read directly from a bounded header slice instead of assuming wall time equals encoded time. Overlapping snapshots use reference-counted protection. New tests cover delayed Save delivery, post-cutoff writes, overlapping file protection and metadata parsing. The integration save is decoded through FFmpeg and checked to end at the requested cutoff within packet/frame precision.
