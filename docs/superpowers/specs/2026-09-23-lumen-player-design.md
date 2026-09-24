# Lumen — local video player and quick editor

Date: 2026-09-23
Status: approved in conversation, pending spec review

## Goal

Lumen is a Windows desktop player that replaces the default Movies & TV experience for local clips. The user opens a file, watches it with a keyboard-first control scheme, jumps between videos in the same folder, loops the whole file or a segment, and exports a trim or a crop as a new file beside the original.

The original file is never modified or overwritten.

Interface language is English. The app name is Lumen. Application id: `com.lumen.player`.

## Stack

- Electron, via electron-vite
- Renderer: React + TypeScript
- Playback: the HTML5 video element
- Export and thumbnail/remux work: a bundled `ffmpeg.exe` (ffmpeg-static), spawned with an argument array and no shell
- Codec probe: `ffmpeg -hide_banner -i <file>` stderr, parsed for stream lines. No second binary.
- Tests: Vitest, on pure functions only
- Installer: electron-builder, NSIS, per-user, with file associations

No accounts, no network API, no database. Preferences live in a JSON file under `app.getPath('userData')`.

## Process boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| Main process | Window, single instance, OS file open, folder scan, ffmpeg jobs, file-association registration, settings file | Node, ffmpeg binary |
| Preload | Typed IPC bridge. The renderer never touches Node directly | Main IPC channels |
| Renderer | Playback, keyboard, timeline, folder list, crop overlay, export progress | Preload API |
| `src/shared` | Pure functions used by main and renderer, covered by unit tests | Nothing I/O-related |

### IPC surface

- `library:list(filePath) -> { folder, items: { path, name }[] }`
- `media:probe(filePath) -> { videoCodec, audioCodec, width, height, duration }`
- `media:prepare(filePath) -> { playablePath }` direct file or remuxed temp mp4
- `thumbs:get(filePath) -> { imagePath | null }` cached jpeg, generated in the background
- `export:start(request) -> { jobId }`
- `export:cancel(jobId)`
- `export:progress` event `{ jobId, ratio }` and `export:done` `{ jobId, outputPath }` or `export:error` `{ jobId, message }`
- `shell:showItem(filePath)`
- `shell:openDefaultApps()`
- `settings:get` / `settings:set`

## Window and session

- One window. Minimum size 960×600. Bounds restored from settings.
- Custom title bar: wordmark, current file name, minimize, maximize, close.
- `requestSingleInstanceLock`. A second launch focuses the existing window and opens the file path from the new argv.
- Open sources, in order of precedence when several arrive together: argv file path, drag-and-drop (first recognized video), nothing (empty state with “Open a video”).
- An Open button uses the native file dialog, filtered to the supported extensions.
- Drag-and-drop of a video onto the window replaces the current file and refreshes the folder list.

## Supported files

Extensions, case-insensitive: `.mp4`, `.mkv`, `.mov`, `.webm`, `.m4v`, `.avi`.

Folder listing includes only these extensions. Sort is natural and case-insensitive, so `clip_2` comes before `clip_10`. The list renders immediately with names. Durations are not required for the list.

### Playback path

1. `.mp4`, `.mov`, `.webm`, `.m4v`: play the file directly in the video element.
2. `.mkv` and `.avi`: probe streams. If the first video stream is `h264` and the first audio stream is `aac`, `mp3`, or absent, remux with `-c copy` to a temp mp4 and play that. Temp files live in `userData/playback-cache`, keyed by absolute path + mtime + size. Reuse a fresh cache hit. Evict oldest files when the cache exceeds 2 GB.
3. Anything else, or a video element error after a direct open: show “This clip can’t be played. You can still export it if ffmpeg can read it.” The folder list and export stay available. Do not crash.

Export, the title-bar file name, and “Show in folder” always use the original path. A remuxed temp file is only the video element `src`. The custom `lumen://` response honors `Range` and answers `206` with `Accept-Ranges: bytes`. Without that, a seek is read from the first byte and the picture jumps back to 0.

HEVC playback is best-effort through the OS decoder. If the video element errors, use the same unplayable message. Do not transcode on open.

## Layout

Dark, near-black background (`#06070b`), hairline translucent borders, ice-mint accent (`#5CE1FF`), primary text `#E8EEF7`, muted text `#8B95A8`. Panels use 16px radius. The UI font is bundled (Outfit, OFL) so the look does not depend on the network. The wordmark uses the same family with wide tracking.

```
LUMEN          clip-name.mp4                 — □ ✕
┌──────────┬──────────────────────────────────┐
│ folder   │                                  │
│ list     │            video                 │
│          │         crop overlay if on       │
│          ├──────────────────────────────────┤
│          │ timeline, playhead, A–B region   │
│          │ transport, volume, loop, export  │
└──────────┴──────────────────────────────────┘
```

- The folder column is 280px, collapsible. `M` toggles it. The choice is remembered in settings.
- While playing, the title bar and transport fade out 2.5s after the last mouse move. They return on mousemove. The timeline stays visible so a click or drag can land on any second. The keyboard keeps working while the other controls are hidden.
- While paused, controls stay visible.
- Click on the video toggles play/pause. Double-click toggles fullscreen and does not change play state.
- Scroll zooms toward the cursor, from 100% to 800%. The picture moves with a compositor transform updated once per frame. Wheel input is not applied through React state.
- Fullscreen hides the folder column and lays the title bar, timeline, and transport over the picture, so the whole frame fills the window. Leaving fullscreen restores the folder if it was open.
- Empty state: centered “Open a video” and a short line listing the keyboard shortcuts for seek, volume, and folder navigation.

## Keyboard

Ignore shortcuts when the event target is a text field or `contenteditable`. A volume slider does not count as a text field, so the arrows still seek. Handle shortcuts when controls are hidden. Playback continues while an export runs. During an export, Esc does not clear marks and does not cancel the job. Cancel is a button only.

| Input | Action |
|---|---|
| Left / Right | Seek one second backward / forward |
| Shift+Left / Shift+Right | Seek by `max(0.5s, 5% of duration)` |
| Up / Down | Volume −5% / +5% |
| Ctrl+Left / Ctrl+Right | Previous / next video in the folder. These do not also seek |
| Space | Play / pause |
| L | Toggle whole-file loop |
| I | Set A to `currentTime` |
| O | Set B to `currentTime` |
| F | Toggle fullscreen |
| M | Toggle folder column |
| C | Toggle crop mode |
| Enter | Start export when export is allowed |
| Esc | If an export is running, do nothing. If the window is fullscreen, leave fullscreen. If crop mode is on, exit crop mode and discard the rect. Otherwise clear A and B |
| Home / End | Seek to 0 / duration |

Key repeat from the OS is accepted for arrows.

### Seek step

Left and Right move one second, so key repeat can land on any second. Shift plus Left or Right uses `stepSeconds = max(0.5, duration * 0.05)`. The timeline click and drag seek to the exact time under the cursor.

If `duration` is not finite or is `0`, ignore the seek. Clamp the resulting time to `[0, duration]`.

### Volume

HTML5 volume is `0..1`. Each Up/Down adds or subtracts `0.05`, clamped to that range. The on-screen value is `Math.round(volume * 100)`.

Volume is persisted when it changes.

### Sibling navigation

Ctrl+Left / Ctrl+Right move one index in the natural-sorted folder list. At the first item, Ctrl+Left does not wrap and shows the OSD “First clip”. At the last item, Ctrl+Right shows “Last clip”. Switching clips keeps the current volume and the whole-file loop flag. A–B marks and crop mode reset for the new file.

## On-screen display

A transient label, centered low over the video, for 800ms:

- Seek: the actual jump and the new timestamp. A one-second step is `−1s` or `+1s` plus `m:ss`. When the 5% step is used, the label is `−5%` or `+5%` plus `m:ss`. When the 0.5s floor is used instead, the label is `−0.5s` or `+0.5s` plus `m:ss`.
- Volume: `Volume 40%`
- Sibling jump: the new file name, or “First clip” / “Last clip”
- Loop: “Loop on” / “Loop off”
- Segment: “A set” / “B set” / “Segment cleared”

Refreshing the same OSD restarts the 800ms timer.

## Timeline

- The timeline spans `0..duration`.
- Click seeks to that time. Dragging the playhead seeks live.
- Hover shows a time tooltip.
- A and B are handles on the timeline once set. Dragging a handle updates that mark. The highlighted region is `[A, B]`.
- Minimum distance between A and B is 0.1s, applied only when both marks exist. If a key or a drag would make the span shorter, push the other mark out. Pushing never moves a mark outside `[0, duration]`. If the duration itself is under 0.1s, A is 0 and B is `duration`.

### Whole-file loop

`L` and the Loop button toggle the video element’s loop behavior for the full duration. The flag persists in settings.

### Segment loop

- `I` sets A. `O` sets B. If both exist and `B < A`, swap them immediately.
- If only A is set, segment loop is not active yet.
- If only B is set, segment loop is not active yet.
- When both are set, segment loop is active. While playback reaches B (within 0.05s), or the file ends, seek to A on the next turn and keep playing. Assigning `currentTime` inside `timeupdate` is not reliable, because the media clock overwrites it. Scrubbing outside `[A, B]` is allowed and does not clear the marks. While paused outside the segment, playback stays there.
- Segment loop takes priority over whole-file loop. Whole-file loop remains as stored and applies again when the segment is cleared.
- Esc, when fullscreen and crop mode are off, clears A and B. The Clear button clears A and B whenever either mark is set.
- Marks are not persisted across files or restarts.

## Overlay

Ctrl+Alt+L, or the shortcut saved in settings, opens a borderless always-on-top window on the monitor under the cursor. The window is opaque (`#07080d`), the desktop stays visible around it, and the window can be resized. Its size is remembered. It lists the last folder, newest clip first, and can switch among the eight most recent folders. Search filters by name. Sort can switch to name, oldest, or largest. A checkbox, Ctrl+click, or Shift+click selects clips, and Delete removes those files from disk after confirmation. The player folder list does the same. Browse adds a folder; the folder dialog is owned by the overlay and the window drops below it while the dialog is open.

Clip cards are grid items with an explicit minimum height, so the row cannot squash a 16:9 frame into a line. Sidebar rows use a fixed 128×72 thumbnail. Cached jpeg posters are requested only for clips on screen. AV1 captures, which this ffmpeg build cannot decode, show a paused frame from the same video element that plays the clip, and only while that card is on screen. Hover waits a short moment, then plays that same file muted, with a mini seek bar. Hover does not transcode. A file the video element cannot decode still gets an H.264 proxy, and only after it is opened. Opening the overlay focuses it and defocuses the game. Closing it returns focus to the game. The pointer is not confined. A still frame, once drawn, stays on the card when it scrolls off screen. Closing the player pauses the clip, hides its window, and leaves Lumen in the tray. Opening a file or the player from the tray shows that window again. Quit on the tray icon exits.

Opening a clip shows a Back control, a volume slider, and a length bar. Trim stays off until Trim is pressed. Then the bar shows a draggable segment: the ends set in and out, the body moves the whole span, and a click seeks. Playback loops inside that span. Download uses the span only while Trim is on; otherwise it exports the whole clip, and writes it next to the source. Original copies the stream when there is no trim that forces a reencode. AV1 is always copied, because this ffmpeg cannot decode it. Small, Balanced, and High set a video bitrate and show a live size estimate. Space toggles play unless focus is in a text field. Set overlay stores the shortcut and whether Lumen starts hidden with Windows. Alt+Z is left for NVIDIA. The window close button hides the player; Quit is on the tray icon. The Windows icon and version resource name are Lumen.

## Folder column

Each row shows a thumbnail (or a plain placeholder until one exists) and the file name. The current file is highlighted. Clicking a row loads it the same way sibling navigation does.

Thumbnails: up to three ffmpeg jobs at once, a fast seek to 1s (or 0 when the probe duration is under 1s), then a decoded-frame fallback if that seek produces nothing. One frame, scaled to width 480, written to `userData/thumb-cache` keyed by path + mtime + size. A missing thumbnail never blocks the row. Failures leave the placeholder. Clips the video element cannot decode get a cached H.264 preview proxy on demand.

## Crop

`C` toggles crop mode. Entering crop mode creates a default rectangle: 80% of the video frame width and height, centered, then snapped to even integers.

The overlay sits on the displayed video, inside the contained image (object-fit: contain). Letterbox margins are not part of the image. The dim outside the rect covers only the video image.

- Drag inside the rect to move it, clamped to the frame.
- Drag edges or corners to resize, clamped to the frame.
- Minimum size: 2% of the frame on each axis, and at least 2 pixels, then snapped even.
- Presets, as chips: Free, 16:9, 9:16, 1:1. Choosing a preset fits the largest rectangle of that aspect inside the frame, centered, even-snapped. Free leaves the current rect and unlocks the aspect.
- While a preset other than Free is active, resizing keeps that aspect.
- Stored values are video pixels: `{ x, y, w, h }`, even integers, `x + w <= videoWidth`, `y + h <= videoHeight`.
- Mapping from screen to video accounts for the contained rectangle’s offset and scale. A function `mapCropToVideoPixels` is the only place that conversion happens, and it is unit-tested.
- Esc exits crop mode and discards the rect. Export includes a crop only while crop mode is on.

## Export

Export writes a new file in the same directory as the source. It never writes the source path. If the candidate path equals the source path, or already exists, append `_2`, `_3`, … before the extension until the path is free.

| Mode | When | File name | ffmpeg |
|---|---|---|---|
| Fast trim | A and B set, crop mode off, Precise off | `{stem}_trim.mp4` | stream copy |
| Precise trim | A and B set, crop mode off, Precise on | `{stem}_edit.mp4` | libx264 + aac |
| Crop | Crop mode on. A and B optional | `{stem}_edit.mp4` | crop filter + libx264 + aac |

Rules:

- Export is disabled until the source is loaded and ffmpeg is idle.
- Fast trim and precise trim require both A and B. If one mark is missing, the Export control explains “Set in and out with I and O”.
- If only a crop is active and A/B are missing, the export uses the full duration.
- If crop mode is on and A/B are set, the export applies both the time range and the crop.
- Crop forces a re-encode. The Precise switch shows on and disabled while crop mode is on.
- Precise defaults to off and is persisted.
- Fast trim UI copy, always visible when that mode will be used: “Fast trim cuts on the nearest keyframe.”

Time range for ffmpeg: start = A or 0, end = B or duration.

Fast trim arguments:

```
ffmpeg -y -ss {start} -to {end} -i {input} -map 0:v -map 0:a? -c copy -avoid_negative_ts make_zero -progress pipe:1 {output}
```

Precise trim arguments:

```
ffmpeg -y -ss {start} -to {end} -i {input} -map 0:v -map 0:a? -c:v libx264 -preset veryfast -crf 18 -c:a aac -b:a 192k -movflags +faststart -progress pipe:1 {output}
```

Crop arguments (start/end omitted when exporting the full file):

```
ffmpeg -y -ss {start} -to {end} -i {input} -map 0:v -map 0:a? -vf crop={w}:{h}:{x}:{y} -c:v libx264 -preset veryfast -crf 18 -c:a aac -b:a 192k -movflags +faststart -progress pipe:1 {output}
```

If the probe reports no audio stream, omit `-map 0:a?`, `-c:a`, and `-b:a`.

Progress comes from `-progress pipe:1`. FFmpeg’s `out_time_ms` value is microseconds, so the ratio is `out_time_ms / 1_000_000 / (end - start)`, clamped to `0..1`. The UI shows that percentage and a Cancel control. Cancel kills the ffmpeg process and does not use Esc. A cancelled or failed job deletes a partial output file if one was created. Stderr is still captured for the error toast.

On success, a toast shows the output file name and a “Show in folder” action (`shell:showItem`). On failure, a toast shows the last non-empty stderr line. The source file is left untouched in every case.

Only one export runs at a time. Enter and the Export button do nothing while a job is running.

## Default player on Windows

Windows 10 and 11 do not allow an app to silently replace the user default. Lumen does two things:

1. The NSIS installer registers a ProgID and file associations for the six extensions, so Lumen appears in Open with.
2. A gear in the title bar opens a menu with one action, “Set as default player”, which opens `ms-settings:defaultapps`. Helper copy under the action: “In Default apps, choose Lumen for video files. You can also right-click a clip, then Open with, Lumen, Always.”

Precise trim stays next to Export, not in this menu.

Dev runs (`npm run dev`) accept a file path argument but do not register associations. Registration belongs to the installed build.

## Settings persisted

- `volume` (0..1, default 1)
- `loop` (boolean, default false)
- `preciseTrim` (boolean, default false)
- `folderOpen` (boolean, default true)
- `windowBounds` (`{ x, y, width, height }`)

A–B marks, crop rect, and the current file path are not persisted.

## Errors

| Case | Behavior |
|---|---|
| Path does not exist | Inline message “File not found”. Stay on the empty state or the previous file if one is still open |
| Unplayable codec | Message described in Playback path. App stays open |
| ffmpeg missing at runtime | Export disabled. Message “ffmpeg is not available” |
| ffmpeg non-zero exit | Error toast with the last stderr line. Delete partial output |
| Output not writable | Error toast. Source unchanged |
| Thumbnail or remux failure | Placeholder, or the unplayable message. Playback of other files continues |

No error is swallowed. Main-process failures are logged with the file path and the ffmpeg exit code.

## Out of scope

Color, text, transitions, subtitles, streaming, multi-folder playlists, overwriting the source, silent default-app takeover, accounts.

## Testing

Vitest covers the pure functions in `src/shared`:

- `seekStep(duration)` — 5% rule, 0.5s floor, non-finite duration
- `clampVolume`
- `siblingIndex(items, current, direction)` — middle, first, last
- `naturalSort`
- `nextOutputPath(source, suffix, existingNames)` — first free name, `_2` collision, never equal to the source name
- `normalizeRange(a, b)` — swap when b < a, reject a span under 0.1s
- `mapCropToVideoPixels` — letterbox offset, scale, even snap, clamp inside the frame
- `evenRect` — odd inputs become even without leaving the frame

A manual pass before calling the app done: open an mp4, seek, volume, Ctrl sibling jump, folder click, whole-file loop, A–B loop, fast trim export, crop export, cancel mid-export. Confirm the new files sit beside the original and the original byte size is unchanged.

## Project layout

```
src/main/index.ts            window, single instance, IPC registration
src/main/library.ts          folder scan and natural sort glue
src/main/ffmpeg.ts           probe, remux, thumbnail, export, cancel
src/main/settings.ts         read/write the JSON settings file
src/main/associations.ts     open the Windows default-apps page
src/preload/index.ts
src/renderer/App.tsx
src/renderer/components/PlayerView.tsx
src/renderer/components/Timeline.tsx
src/renderer/components/FolderList.tsx
src/renderer/components/CropOverlay.tsx
src/renderer/components/Transport.tsx
src/shared/seek.ts
src/shared/volume.ts
src/shared/library.ts
src/shared/exportPaths.ts
src/shared/range.ts
src/shared/crop.ts
src/shared/*.test.ts
```

## Success criteria

- Double-clicking a supported file in Explorer opens it in Lumen once the installer association is chosen by the user.
- Left/Right seek `max(0.5s, 5% of duration)`. Up/Down change volume by 5 points. Ctrl+Left/Right change clips inside the folder and do not wrap.
- The folder list shows every supported file in that folder and loads the one that is clicked.
- Whole-file loop and A–B loop both work, and A–B wins while a segment is set.
- Fast trim produces a new `*_trim.mp4` quickly. Crop produces a new `*_edit.mp4`. The source file is unchanged.
- The interface matches the layout and color direction in this spec, in English.
