# Lumen

Lumen is a local Windows player for watching a folder of clips and exporting a trim or a crop without changing the original file.

## Setup

```bash
npm install
npm run dev
```

`npm test` runs the unit tests. `npm run dist` builds an unsigned per-user installer. After installing, pick Lumen from Open with and choose Always. Windows does not let an app take the default silently. The gear menu opens Default apps.

## Overlay

Ctrl+Alt+L opens a player over the current screen, on the last folder you used. The folder menu lists recent folders, and Browse picks another one, such as the NVIDIA captures folder. Set overlay changes the shortcut and can start Lumen with Windows. Alt+Z stays with NVIDIA. Closing the player window leaves Lumen in the tray so the shortcut still works. Quit is on the tray icon.

## Playback

- Left and Right move one second. Shift+Left and Shift+Right seek `max(0.5s, 5% of the clip)`
- Drag the timeline to any second. It stays on screen while the other controls fade
- Up and Down change volume by 5 points
- Ctrl+Left and Ctrl+Right move to the previous or next clip in the folder
- `F` or a double-click fills the window with the whole picture and hides the folder column. Esc leaves fullscreen
- `L` loops the whole file
- `I` and `O` mark a segment. Playback jumps from B back to A. Clear removes the marks
- `C` crops the frame. Esc leaves crop mode and discards the rectangle
- Enter exports the selection

Fast trim copies the stream and cuts on the nearest keyframe. Precise trim and every crop re-encode to a new `.mp4` beside the original. Names look like `clip_trim.mp4` or `clip_edit.mp4`.

Supported extensions: mp4, mkv, mov, webm, m4v, avi. mp4, mov, webm, and m4v play directly. mkv and avi play when the video is H.264 and the audio is AAC, MP3, or absent.
