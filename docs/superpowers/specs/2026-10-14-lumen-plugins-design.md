# Lumen plugins

Plugins stay unloaded until they are enabled. An enabled plugin adds one card to the hub wheel and keeps its own settings: shortcut, and whatever else it needs. The player does not scan or hook for a plugin that is off.

## Soundboard

The first plugin. Hold its key (default F8) anywhere on the PC. A wheel opens at the cursor, centered on the point where the key went down. Move the mouse onto a slice and release to play that sound. Release in the center and nothing plays. The window is visual only: it does not take focus and it does not take clicks.

Sounds are files in the plugin folder: `.wav`, `.mp3`, or `.ogg`. The file name is the label. The wheel uses the first 12 names, alphabetically. Community packs are more files in that folder, not code running inside Lumen.

The keyboard hook exists only while the plugin is enabled. The wheel window is created once and hidden, the same way the screenshot window stays warm.

Games such as Apex lock the cursor, so the wheel reads raw mouse movement while the cursor stays still. On the desktop, where the cursor actually moves, the slice follows the cursor. The hook only observes that movement.

Sounds play on the headset only. Lumen never opens the microphone for the soundboard, so Discord keeps the real mic, voice stays clean, and Windows does not duck other apps. Injecting into Discord without changing Discord’s input needs a Soundpad-style capture driver, which this plugin does not ship.

The hub bar always has a Plugins button, including while Soundboard is off. It opens the same panel as the wheel card. Enabled turns the plugin on. The wheel card appears only after that.

## Screenshot over a game

The selector stays above a fullscreen window by repeating topmost placement without activating the window. When the cursor is locked, a crosshair follows raw mouse movement and the left button draws the region. On the desktop the normal pointer still draws it. The picture prefers the foreground window when that window covers the monitor, and otherwise uses the screen.
