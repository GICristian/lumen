# Lumen Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Windows Electron player named Lumen that plays local clips, walks the folder from the keyboard, loops a file or an A–B segment, and exports a trim or crop as a new file beside the original.

**Architecture:** electron-vite splits a Node main process (folder scan, ffmpeg, settings, single instance) from a React renderer (playback, timeline, crop, folder list). Shared pure functions own seek, volume, sort, export names, A–B marks, and crop pixel mapping, and Vitest covers them. The renderer talks only through a typed preload bridge.

**Tech Stack:** Electron, electron-vite, React, TypeScript, Vitest, ffmpeg-static, electron-builder NSIS, Outfit via `@fontsource/outfit`.

## Global Constraints

- App name Lumen, app id `com.lumen.player`, UI copy in English.
- Extensions, case-insensitive: `.mp4`, `.mkv`, `.mov`, `.webm`, `.m4v`, `.avi`.
- Seek step is `max(0.5, duration * 0.05)` seconds. Volume step is `0.05` on a `0..1` scale.
- Ctrl+Left/Right do not wrap. OSD is “First clip” or “Last clip”.
- A–B wins over whole-file loop. Minimum span is 0.1s. Duration under 0.1s uses `{ a: 0, b: duration }`.
- Export never writes the source path. Fast trim name is `{stem}_trim.mp4`. Crop or precise name is `{stem}_edit.mp4`. Collisions use `_2`, `_3`, …
- Fast trim is stream copy and shows “Fast trim cuts on the nearest keyframe.” Crop always re-encodes (`libx264`, `-preset veryfast`, `-crf 18`, audio `aac` at `192k` when a stream exists).
- Export, title, and Show in folder use the original path. Remux temps are only the video `src`.
- Esc during an export does nothing. Cancel is a button and deletes a partial output.
- Windows cannot be silently set as the default player. The gear opens `ms-settings:defaultapps`.
- Original file bytes are never modified.
- Colors: background `#06070b`, accent `#5CE1FF`, text `#E8EEF7`, muted `#8B95A8`.
- No accounts, database, subtitles, grading, streaming, or multi-folder playlists.

---

## File structure

```
package.json
electron.vite.config.ts
vitest.config.ts
tsconfig.json
electron-builder.yml
src/shared/seek.ts
src/shared/volume.ts
src/shared/library.ts
src/shared/exportPaths.ts
src/shared/range.ts
src/shared/crop.ts
src/shared/types.ts
src/shared/*.test.ts
src/main/index.ts
src/main/library.ts
src/main/ffmpeg.ts
src/main/settings.ts
src/main/ipc.ts
src/preload/index.ts
src/renderer/index.html
src/renderer/src/main.tsx
src/renderer/src/App.tsx
src/renderer/src/styles.css
src/renderer/src/player/usePlayback.ts
src/renderer/src/components/TitleBar.tsx
src/renderer/src/components/FolderList.tsx
src/renderer/src/components/VideoStage.tsx
src/renderer/src/components/Timeline.tsx
src/renderer/src/components/Transport.tsx
src/renderer/src/components/CropOverlay.tsx
src/renderer/src/components/Osd.tsx
readme/README.md
```

Renderer files live under `src/renderer/src` because that is electron-vite’s default. Shared logic stays in `src/shared`.

## Interfaces produced for later tasks

```ts
export function seekStep(duration: number): number | null
export function applySeek(current: number, duration: number, direction: -1 | 1): number | null
export function clampVolume(volume: number): number
export function stepVolume(volume: number, direction: -1 | 1): number
export const VIDEO_EXTENSIONS: readonly string[]
export function isVideoName(name: string): boolean
export function naturalSort(names: string[]): string[]
export type SiblingMove = { index: number } | { edge: "first" | "last" }
export function siblingIndex(length: number, current: number, direction: -1 | 1): SiblingMove
export function nextOutputPath(sourcePath: string, suffix: "trim" | "edit", existingNames: string[]): string
export type Marks = { a: number | null; b: number | null }
export function normalizeRange(a: number, b: number, duration: number): { a: number; b: number }
export function setMark(marks: Marks, which: "a" | "b", time: number, duration: number): Marks
export type VideoRect = { x: number; y: number; w: number; h: number }
export type ScreenBox = { left: number; top: number; width: number; height: number }
export function evenRect(rect: VideoRect, frame: { width: number; height: number }): VideoRect
export function mapCropToVideoPixels(displayRect: ScreenBox, videoBox: ScreenBox, videoWidth: number, videoHeight: number): VideoRect
export function defaultCrop(videoWidth: number, videoHeight: number): VideoRect
export function presetCrop(videoWidth: number, videoHeight: number, aspect: number): VideoRect
export function containedVideoBox(container: ScreenBox, videoWidth: number, videoHeight: number): ScreenBox
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` runs Vitest; `npm run dev` opens an empty Electron window titled Lumen

- [ ] **Step 1: Add package.json and configs**

`package.json` scripts: `dev` = `electron-vite dev`, `build` = `electron-vite build`, `dist` = `npm run build && electron-builder`, `test` = `vitest run`, `typecheck` = `tsc --noEmit`. Dependencies: electron, electron-vite, react, react-dom, vite, @vitejs/plugin-react, typescript, vitest, ffmpeg-static, @fontsource/outfit, electron-builder. `"type": "module"`.

`vitest.config.ts` includes `src/shared/**/*.test.ts` and aliases `@shared` to `src/shared`.

`electron.vite.config.ts` uses `externalizeDepsPlugin` for main and preload, and the React plugin for the renderer. Alias `@shared` to `src/shared` in all three.

- [ ] **Step 2: Minimal window**

Main creates a `BrowserWindow` at least 960×600, `frame: false`, `backgroundColor: '#06070b'`, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload script. Load the renderer dev URL or the built `index.html`.

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: Vitest exits 0 with no test files, or “no test files found” treated as success only after Task 2 adds tests. Until then, `npx tsc --noEmit` is not required to pass if renderer types are still loose. `npm run dev` must show a window. Stop the dev process after the window appears.

- [ ] **Step 4: Commit**

```bash
git add package.json electron.vite.config.ts vitest.config.ts tsconfig.json tsconfig.node.json src
git commit -m "chore: scaffold the Lumen electron app"
```

### Task 2: Seek and volume

**Files:**
- Create: `src/shared/seek.ts`, `src/shared/seek.test.ts`, `src/shared/volume.ts`, `src/shared/volume.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `seekStep`, `applySeek`, `clampVolume`, `stepVolume`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { applySeek, seekStep } from "./seek";

describe("seekStep", () => {
  it("uses 5 percent of the duration", () => {
    expect(seekStep(100)).toBe(5);
  });

  it("floors the step at 0.5 seconds", () => {
    expect(seekStep(4)).toBe(0.5);
  });

  it("returns null when duration is not usable", () => {
    expect(seekStep(0)).toBeNull();
    expect(seekStep(Number.NaN)).toBeNull();
    expect(seekStep(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("applySeek", () => {
  it("clamps to the ends of the clip", () => {
    expect(applySeek(1, 100, -1)).toBe(0);
    expect(applySeek(98, 100, 1)).toBe(100);
  });
});
```

```ts
import { describe, expect, it } from "vitest";
import { clampVolume, stepVolume } from "./volume";

describe("volume", () => {
  it("clamps to 0..1", () => {
    expect(clampVolume(-0.2)).toBe(0);
    expect(clampVolume(1.4)).toBe(1);
  });

  it("steps by 0.05 and clamps", () => {
    expect(stepVolume(0.5, 1)).toBeCloseTo(0.55);
    expect(stepVolume(0.02, -1)).toBe(0);
    expect(stepVolume(0.98, 1)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npx vitest run src/shared/seek.test.ts src/shared/volume.test.ts`
Expected: FAIL, cannot find modules.

- [ ] **Step 3: Implement**

```ts
export function seekStep(duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return Math.max(0.5, duration * 0.05);
}

export function applySeek(current: number, duration: number, direction: -1 | 1): number | null {
  const step = seekStep(duration);
  if (step === null) return null;
  const next = current + step * direction;
  return Math.min(duration, Math.max(0, next));
}
```

```ts
export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(1, Math.max(0, volume));
}

export function stepVolume(volume: number, direction: -1 | 1): number {
  const base = clampVolume(volume);
  return clampVolume(Math.round((base + 0.05 * direction) * 1000) / 1000);
}
```

`Math.round(... * 1000) / 1000` keeps 0.55 from becoming 0.5500000001. Tests use `toBeCloseTo` for the mid step and exact clamps at the ends.

- [ ] **Step 4: Re-run the same vitest command. Expected: PASS**

- [ ] **Step 5: Commit** `test: cover seek steps and volume clamps`

### Task 3: Folder ordering and sibling index

**Files:**
- Create: `src/shared/library.ts`, `src/shared/library.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `VIDEO_EXTENSIONS`, `isVideoName`, `naturalSort`, `siblingIndex`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { isVideoName, naturalSort, siblingIndex } from "./library";

describe("isVideoName", () => {
  it("accepts supported extensions in any case", () => {
    expect(isVideoName("Clip.MP4")).toBe(true);
    expect(isVideoName("note.txt")).toBe(false);
  });
});

describe("naturalSort", () => {
  it("orders clip_2 before clip_10 without regard to case", () => {
    expect(naturalSort(["clip_10.mp4", "Clip_2.mp4", "clip_1.mp4"])).toEqual([
      "clip_1.mp4",
      "Clip_2.mp4",
      "clip_10.mp4",
    ]);
  });
});

describe("siblingIndex", () => {
  it("moves inside the list and reports the edges", () => {
    expect(siblingIndex(3, 1, 1)).toEqual({ index: 2 });
    expect(siblingIndex(3, 0, -1)).toEqual({ edge: "first" });
    expect(siblingIndex(3, 2, 1)).toEqual({ edge: "last" });
  });
});
```

- [ ] **Step 2: Confirm FAIL**

- [ ] **Step 3: Implement**

`VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "webm", "m4v", "avi"]`. `isVideoName` checks the extension after the last dot. `naturalSort` copies the array and sorts with `Intl.Collator(undefined, { numeric: true, sensitivity: "base" })`. `siblingIndex` returns `{ edge: "first" }` when `direction < 0 && current <= 0`, `{ edge: "last" }` when `direction > 0 && current >= length - 1`, otherwise `{ index: current + direction }`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat: sort folder clips and step between them`

### Task 4: Export file names

**Files:**
- Create: `src/shared/exportPaths.ts`, `src/shared/exportPaths.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `nextOutputPath(sourcePath, suffix, existingNames)`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { nextOutputPath } from "./exportPaths";

describe("nextOutputPath", () => {
  it("uses the suffix for the first free file", () => {
    expect(nextOutputPath("D:/clips/clip.mkv", "trim", [])).toBe(
      path.win32.join("D:/clips", "clip_trim.mp4"),
    );
  });

  it("increments when the name is taken", () => {
    expect(nextOutputPath("D:/clips/clip.mp4", "edit", ["clip_edit.mp4"])).toBe(
      path.win32.join("D:/clips", "clip_edit_2.mp4"),
    );
  });

  it("never returns the source path", () => {
    const source = "D:/clips/clip_trim.mp4";
    expect(nextOutputPath(source, "trim", [])).not.toBe(source);
  });
});
```

Use `path.win32` inside the implementation when the source contains a drive letter, and `path.posix` when it starts with `/` and has no drive, so tests are stable on Windows. Detect with `/^[A-Za-z]:/.test(sourcePath)`.

- [ ] **Step 2: FAIL, then implement**

```ts
import path from "node:path";

export function nextOutputPath(
  sourcePath: string,
  suffix: "trim" | "edit",
  existingNames: string[],
): string {
  const pathApi = /^[A-Za-z]:/.test(sourcePath) ? path.win32 : path.posix;
  const dir = pathApi.dirname(sourcePath);
  const stem = pathApi.basename(sourcePath, pathApi.extname(sourcePath));
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));
  for (let n = 1; n < 10000; n += 1) {
    const name = n === 1 ? `${stem}_${suffix}.mp4` : `${stem}_${suffix}_${n}.mp4`;
    const full = pathApi.join(dir, name);
    if (full === sourcePath) continue;
    if (!taken.has(name.toLowerCase())) return full;
  }
  throw new Error("No free export name");
}
```

The source-collision test: source `clip_trim.mp4` with suffix `trim` produces `clip_trim_trim.mp4`, which is not the source. Add that expectation explicitly if the first assertion is ambiguous. The third test only checks inequality, and `clip_trim_trim.mp4` satisfies it.

- [ ] **Step 3: PASS and commit** `feat: pick a free export name beside the source`

### Task 5: A–B marks

**Files:**
- Create: `src/shared/range.ts`, `src/shared/range.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `normalizeRange`, `setMark`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeRange, setMark } from "./range";

describe("normalizeRange", () => {
  it("swaps when b is before a", () => {
    expect(normalizeRange(8, 2, 10)).toEqual({ a: 2, b: 8 });
  });

  it("expands a span shorter than 0.1s", () => {
    expect(normalizeRange(5, 5.02, 10)).toEqual({ a: 5, b: 5.1 });
  });

  it("uses the whole clip when the clip is shorter than 0.1s", () => {
    expect(normalizeRange(0.04, 0.01, 0.05)).toEqual({ a: 0, b: 0.05 });
  });
});

describe("setMark", () => {
  it("stores a single mark without inventing the other", () => {
    expect(setMark({ a: null, b: null }, "a", 3, 10)).toEqual({ a: 3, b: null });
  });

  it("normalizes once both marks exist", () => {
    expect(setMark({ a: 8, b: null }, "b", 2, 10)).toEqual({ a: 2, b: 8 });
  });
});
```

- [ ] **Step 2: FAIL, then implement `normalizeRange` as specified in the test, and `setMark`**

`setMark` clamps `time` into `[0, duration]`. If duration is under 0.1, return `{ a: 0, b: duration }`. If the other mark is null, return the updated pair. If both exist, return `normalizeRange`.

- [ ] **Step 3: PASS and commit** `feat: normalize loop in and out points`

### Task 6: Crop geometry

**Files:**
- Create: `src/shared/crop.ts`, `src/shared/crop.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `evenRect`, `containedVideoBox`, `mapCropToVideoPixels`, `defaultCrop`, `presetCrop`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { containedVideoBox, defaultCrop, evenRect, mapCropToVideoPixels, presetCrop } from "./crop";

describe("evenRect", () => {
  it("snaps odd edges even and stays inside the frame", () => {
    expect(evenRect({ x: 1, y: 1, w: 11, h: 9 }, { width: 20, height: 20 })).toEqual({
      x: 0,
      y: 0,
      w: 10,
      h: 8,
    });
  });
});

describe("containedVideoBox", () => {
  it("letterboxes a wide video", () => {
    expect(containedVideoBox({ left: 0, top: 0, width: 200, height: 200 }, 400, 200)).toEqual({
      left: 0,
      top: 50,
      width: 200,
      height: 100,
    });
  });
});

describe("mapCropToVideoPixels", () => {
  it("maps a display rect through the letterbox into even video pixels", () => {
    const videoBox = { left: 0, top: 50, width: 200, height: 100 };
    const display = { left: 0, top: 50, width: 100, height: 100 };
    expect(mapCropToVideoPixels(display, videoBox, 400, 200)).toEqual({
      x: 0,
      y: 0,
      w: 200,
      h: 200,
    });
  });
});

describe("presets", () => {
  it("starts at 80 percent centered", () => {
    expect(defaultCrop(100, 100)).toEqual({ x: 10, y: 10, w: 80, h: 80 });
  });

  it("fits a 1:1 preset inside a wide frame", () => {
    const rect = presetCrop(200, 100, 1);
    expect(rect.w).toBe(rect.h);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.y).toBe(0);
  });
});
```

- [ ] **Step 2: FAIL, then implement**

`evenDown(n) = Math.floor(n / 2) * 2`. `evenRect` floors x, y, w, h with `evenDown`, forces w and h to at least 2, then shifts x/y left/up if the rect would leave the even frame. If it still overflows, shrink w/h to the remaining even space.

`containedVideoBox` uses object-fit contain: scale = min(container.width / videoWidth, container.height / videoHeight), then center the fitted size inside the container.

`mapCropToVideoPixels` converts display pixels with `(display - videoBox origin) * (videoSize / videoBox size)`, then `evenRect`.

`defaultCrop` uses 80% of width and height, centered, then `evenRect`. For a 100×100 frame, 80×80 at (10, 10) is already even.

`presetCrop(frameW, frameH, aspect)` fits the largest rect of that width/height aspect inside the frame, centers it, then `evenRect`.

- [ ] **Step 3: PASS and commit** `feat: map crop rectangles into video pixels`

### Task 7: Settings, folder scan, and the preload bridge

**Files:**
- Create: `src/shared/types.ts`, `src/main/settings.ts`, `src/main/library.ts`, `src/main/ipc.ts`, `src/preload/index.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `isVideoName`, `naturalSort`
- Produces: `window.lumen` with `openFile`, `listFolder`, `getSettings`, `setSettings`, `showItem`, `openDefaultApps`

Settings JSON defaults: `{ volume: 1, loop: false, preciseTrim: false, folderOpen: true, windowBounds: null }`. Read returns defaults when the file is missing or invalid. Write is atomic enough for this app: write the JSON with `fs.promises.writeFile`.

`listFolder(filePath)` reads the parent directory, keeps video names, natural-sorts them, and returns `{ folder, currentPath, items: { path, name }[] }`. Missing path throws an error whose message is `File not found`.

Preload uses `contextBridge.exposeInMainWorld("lumen", api)`.

- [ ] **Step 4: Commit** `feat: expose folder listing and settings through preload`

### Task 8: ffmpeg jobs

**Files:**
- Create: `src/main/ffmpeg.ts`
- Modify: `src/main/ipc.ts`

**Interfaces:**
- Consumes: `nextOutputPath`
- Produces: `probe`, `preparePlayback`, `thumbnail`, `startExport`, `cancelExport`

`ffmpegPath()` returns the ffmpeg-static path. When the path contains `app.asar`, replace that segment with `app.asar.unpacked`.

`probe(filePath)` runs `ffmpeg -hide_banner -i file` and parses `Stream #0:0: Video: h264` style lines. Resolve `{ videoCodec, audioCodec, width, height, duration }`. Duration comes from `Duration: HH:MM:SS.ms`. Non-zero exit is still success when stderr contains stream info, because ffmpeg exits 1 when used as a prober.

`preparePlayback` returns `{ playablePath: filePath }` for mp4, mov, webm, and m4v. For mkv and avi, remux with `-c copy` only when video is `h264` and audio is `aac`, `mp3`, or null. Cache key is path + mtime + size under `userData/playback-cache`. If the cache directory exceeds 2 GB, delete oldest files until it is under the cap. Otherwise return `{ playablePath: null, reason: "unplayable" }`.

`thumbnail` writes one jpeg at width 320 into `userData/thumb-cache`, one job at a time, `-ss 1` or `-ss 0` when duration is under 1. Failures resolve `null`.

`startExport` builds the argument lists from the spec. Spawn with `windowsHide: true` and no shell. Parse `out_time_ms` from stdout (`-progress pipe:1`). Emit progress ratio clamped to 0..1. On exit code 0, emit done with `outputPath`. On failure or cancel, delete the partial file and emit the last non-empty stderr line. Only one job at a time; a second start throws `Export already running`.

Arguments match the spec, including omitting audio map and audio codec when `audioCodec` is null.

- [ ] **Commit** `feat: probe, remux, thumbnail, and export with ffmpeg`

### Task 9: Window behavior

**Files:**
- Modify: `src/main/index.ts`, `src/preload/index.ts`

- [ ] Single instance lock. Second instance focuses the window and sends the video path from argv.
- [ ] Persist `windowBounds` on resize and move.
- [ ] IPC `window:minimize`, `window:maximize`, `window:close`.
- [ ] `shell:openPath` dialog filtered to the six extensions. `shell:showItem` uses `shell.showItemInFolder`. `shell:openDefaultApps` uses `shell.openExternal("ms-settings:defaultapps")`.
- [ ] First argv path that `isVideoName` accepts is delivered to the renderer on `lumen:open`.

- [ ] **Commit** `feat: open files from Explorer in a single window`

### Task 10: Shell, playback, and keyboard

**Files:**
- Create: renderer components listed in the file structure, `src/renderer/src/styles.css`
- Modify: `src/renderer/src/App.tsx`

The window is a column: title bar, then a row with the folder list and the stage. The stage is the video, OSD, crop overlay, timeline, and transport.

Title bar: “LUMEN”, current file name, gear, minimize, maximize, close. Gear menu copy is the spec sentence for default apps. Drag region is the title bar, with buttons `no-drag`.

Empty state copy: “Open a video” and “Left and Right seek 5%. Up and Down change volume. Ctrl+Left and Ctrl+Right change clips.”

Keyboard handling lives in one `keydown` listener on `window`:

- Ignore events whose target is input, textarea, or contenteditable.
- Left/Right call `applySeek`. OSD shows `−5%` / `+5%` when `seekStep(duration) === duration * 0.05`, otherwise `−0.5s` / `+0.5s`, plus `m:ss`.
- Up/Down call `stepVolume`, persist volume, OSD `Volume N%`.
- Ctrl+arrows call `siblingIndex` and load that item. Edges show “First clip” / “Last clip”.
- Space toggles play. L toggles whole-file loop and persists it. I/O call `setMark`. F toggles fullscreen. M toggles the folder column and persists `folderOpen`. C toggles crop. Enter starts export when allowed. Esc follows the spec, including no-op during export. Home/End seek to 0 and duration.

Click on video toggles play. Double-click toggles fullscreen and must not leave play state flipped: set a click timer of 220ms, and cancel it on the second click.

Controls fade after 2.5s of no mousemove while playing, and stay visible while paused. OSD clears 800ms after the last message.

Switching files keeps volume and whole-file loop, and resets marks and crop mode.

Video `src` is a `local-file://` protocol or `pathToFileURL` registered as privileged in the main process so Chromium can read it. Register that scheme before `app.ready` as a privileged scheme with `stream: true` and `supportFetchAPI: true`.

- [ ] **Commit** `feat: play clips from the keyboard`

### Task 11: Timeline, loops, folder list, crop, export

**Files:**
- Modify: `Timeline.tsx`, `FolderList.tsx`, `CropOverlay.tsx`, `Transport.tsx`, `App.tsx`

Timeline width maps time linearly. Click and playhead drag seek. Hover tooltip formats `m:ss`. A and B handles render only when set. Dragging a handle calls `setMark`. The region between them uses the accent at 35% opacity.

Whole-file loop sets `video.loop` only when segment loop is inactive. Segment loop is active when both marks are non-null. On `timeupdate`, if segment loop is active and `currentTime >= b - 0.05`, set `currentTime` to A and keep playing.

Folder rows show the file name and an `<img>` when a thumbnail path exists, otherwise a placeholder block. Highlight the current path. Clicking loads the file.

Crop overlay is positioned on `containedVideoBox`. Default rect comes from `defaultCrop` when crop mode turns on. Dragging the body moves it; edge and corner handles resize it. Chips: Free, 16:9, 9:16, 1:1 call `presetCrop` with aspects `16/9`, `9/16`, and `1`. Free keeps the current rect. While a preset is active, resize preserves that aspect. Esc leaves crop mode and drops the rect. Export includes crop only while crop mode is on.

Transport: play, time, volume slider, Loop, In, Out, Precise, Crop, Export, and a progress label with Cancel while a job runs. Precise is disabled and checked during crop. Export stays disabled with “Set in and out with I and O” when a trim needs marks. Fast-trim helper copy is visible only for fast trim. Success toast: file name and “Show in folder”. Error toast: the stderr line from main.

- [ ] **Commit** `feat: loop, crop, and export from the timeline`

### Task 12: Installer associations and readme

**Files:**
- Create: `electron-builder.yml`, `readme/README.md`

electron-builder: `appId: com.lumen.player`, product name Lumen, NSIS per-user, `asarUnpack` for `ffmpeg-static`. File associations for the six extensions, role Viewer, description “Lumen video”.

`readme/README.md` explains install (`npm install`), develop (`npm run dev`), test (`npm test`), package (`npm run dist`), keyboard shortcuts, and how to pick Lumen in Open with. It states that fast trim is keyframe-accurate and crop re-encodes.

- [ ] **Commit** `chore: add the installer associations and readme`

## Spec coverage check

| Spec section | Task |
|---|---|
| Stack and process boundaries | 1, 7, 8 |
| Window, single instance, drag-drop, open dialog | 9, 10 |
| Extensions, natural sort, folder list, thumbnails | 3, 7, 8, 11 |
| Direct play vs remux vs unplayable | 8, 10 |
| Layout, color, font, fading controls | 10 |
| Keyboard, seek, volume, OSD | 2, 10 |
| Timeline, whole-file loop, A–B | 5, 11 |
| Crop geometry and overlay | 6, 11 |
| Export names, ffmpeg args, progress, cancel | 4, 8, 11 |
| Default apps gear | 9, 10 |
| Settings | 7, 9 |
| Errors | 7, 8, 10, 11 |
| Unit tests | 2–6 |
| Out of scope | omitted on purpose |

## Self-review notes

- `setMark` on a clip shorter than 0.1s returns both marks, which matches `normalizeRange` and overrides the “single mark” behavior only for that edge. The test in Task 5 uses a 10s duration for the single-mark case.
- Output files are always `.mp4` even when the source is `.mkv`.
- Commit steps assume the user wants commits. If they do not, leave the steps unchecked and do not commit.
