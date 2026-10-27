import { promises as fs } from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import type { Settings } from "@shared/contracts";
import {
  bindConflicts,
  describeMacro,
  exampleMacroText,
  keyExtended,
  parseMacros,
  sanitizeMacros,
  serializeMacros,
  type MacroBind,
  type MacroCard,
} from "@shared/macros";
import { getSettings, patchSettings } from "./settings";
import { bindMacroEditor, bindMacroToggle, refreshTrayMenu } from "./overlayHost";
import { ownWindowFocused } from "./win32";
import { keyDown, scanOf } from "./macroInput";
import {
  macroPowerGeneration,
  requestMacroPlay,
  setMacroOwnFocus,
  stopMacroRuntime,
  syncMacroRuntime,
} from "./macroRuntime";

const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12;

let file = "";
let macros: MacroBind[] = [];
let mouseTimer: ReturnType<typeof setInterval> | null = null;
let powerSeen = 0;
let powerReady = false;
const mouseWas = new Array<boolean>(7).fill(false);

function blockedBy(macro: MacroBind, settings: Settings): string | null {
  const names: [string, string][] = [
    [settings.replayAccelerator, "Replay"],
    [settings.screenshotAccelerator, "Screenshot"],
    [settings.overlayAccelerator, "Overlay"],
    [settings.vaultAccelerator, "Vault"],
    [settings.soundboardAccelerator, "Soundboard"],
  ];
  const hit = names.find(([accelerator]) => bindConflicts(macro, accelerator));
  return hit ? hit[1] : null;
}

function cards(): MacroCard[] {
  const settings = getSettings();
  return macros.map((macro) => ({
    name: macro.name,
    enabled: macro.enabled,
    bind: macro.bindName || "Unbound",
    summary: describeMacro(macro),
    blocked: blockedBy(macro, settings),
  }));
}

async function readFile(): Promise<void> {
  try {
    macros = parseMacros(await fs.readFile(file, "utf8"));
  } catch {
    macros = parseMacros(exampleMacroText());
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, exampleMacroText(), "utf8");
  }
}

async function importDesktop(): Promise<void> {
  try {
    await fs.access(file);
    return;
  } catch {
    // The plugin file is created from the desktop copy the first time.
  }
  const desktop = path.join(process.env.USERPROFILE ?? "", "Desktop", "MacroBind", "macros.txt");
  try {
    const text = await fs.readFile(desktop, "utf8");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text, "utf8");
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, exampleMacroText(), "utf8");
  }
}

function modifierDown(): boolean {
  return keyDown(VK_CONTROL) || keyDown(VK_MENU) || keyDown(VK_SHIFT);
}

function publishHooks(): void {
  const settings = getSettings();
  if (!settings.macroEnabled) return;
  const powerVk = settings.macroPowerKind === "key" ? settings.macroPowerVk : 0;
  syncMacroRuntime(
    macros,
    settings.macroLive,
    powerVk,
    (macro) => macro.enabled && macro.bindKind === "key" && !blockedBy(macro, settings),
  );
}

function pollPower(): void {
  const generation = macroPowerGeneration();
  if (!powerReady) {
    powerReady = true;
    powerSeen = generation;
    return;
  }
  if (generation === powerSeen) return;
  powerSeen = generation;
  void setMacroLive(!getSettings().macroLive);
}

function powerDown(kind: "key" | "mouse", vk: number, mouse: string): void {
  const settings = getSettings();
  if (!settings.macroEnabled || settings.macroPowerKind !== kind) return;
  if (kind === "key" && settings.macroPowerVk !== vk) return;
  if (kind === "mouse" && settings.macroPowerMouse !== mouse) return;
  void setMacroLive(!settings.macroLive);
}

function watchMouse(): void {
  setMacroOwnFocus(ownWindowFocused());
  pollPower();
  const buttons: [number, string][] = [
    [1, "left"],
    [2, "right"],
    [4, "middle"],
    [5, "x1"],
    [6, "x2"],
  ];
  for (const [vk, name] of buttons) {
    const down = keyDown(vk);
    const was = mouseWas[vk];
    mouseWas[vk] = down;
    if (!down || was || modifierDown() || ownWindowFocused()) continue;
    const settings = getSettings();
    if (settings.macroPowerKind === "mouse" && settings.macroPowerMouse === name) {
      powerDown("mouse", vk, name);
      continue;
    }
    if (!settings.macroLive) continue;
    const index = macros.findIndex((item) => (
      item.enabled
      && item.bindKind === "mouse"
      && item.bindMouse === name
      && !blockedBy(item, settings)
    ));
    if (index >= 0) requestMacroPlay(index);
  }
}

export function macroLibrary(): { macros: MacroCard[] } {
  return { macros: cards() };
}

/** Arms or drops the bind. The sequence itself never opens the microphone. */
export function applyMacro(settings: Settings): void {
  if (!settings.macroEnabled) {
    if (mouseTimer) clearInterval(mouseTimer);
    mouseTimer = null;
    stopMacroRuntime();
    refreshTrayMenu();
    return;
  }
  if (!mouseTimer) mouseTimer = setInterval(watchMouse, 8);
  publishHooks();
  refreshTrayMenu();
}

export async function setMacroEnabled(enabled: boolean): Promise<Settings> {
  const settings = await patchSettings({ macroEnabled: enabled, macroLive: enabled });
  applyMacro(settings);
  return settings;
}

export async function setMacroLive(live: boolean): Promise<Settings> {
  const settings = await patchSettings({ macroLive: live });
  applyMacro(settings);
  return settings;
}

let editor: BrowserWindow | null = null;

function stampScans(list: MacroBind[]): void {
  for (const macro of list) {
    if (macro.bindKind === "key" && macro.bindVk > 0 && macro.bindScan <= 0) {
      macro.bindScan = scanOf(macro.bindVk);
      macro.bindExtended = macro.bindExtended || keyExtended(macro.bindVk);
    }
    for (const step of macro.steps) {
      if (step.device !== "key" || step.vk <= 0 || step.scan > 0) continue;
      step.scan = scanOf(step.vk);
      step.extended = step.extended || keyExtended(step.vk);
    }
  }
}

function loadEditor(win: BrowserWindow): void {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) void win.loadURL(`${dev}#/macro`);
  else void win.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "/macro" });
}

/** Opens the keyboard editor. A second call brings the same window forward. */
export function openMacroEditor(): void {
  if (editor && !editor.isDestroyed()) {
    if (editor.isMinimized()) editor.restore();
    editor.show();
    editor.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 1280,
    height: 680,
    minWidth: 1080,
    minHeight: 600,
    frame: false,
    show: false,
    title: "Macro",
    backgroundColor: "#12110f",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  editor = win;
  win.on("closed", () => {
    if (editor === win) editor = null;
  });
  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.show();
    win.focus();
  });
  loadEditor(win);
}

export function macroWindow(action: "minimize" | "maximize" | "close"): void {
  if (!editor || editor.isDestroyed()) return;
  if (action === "minimize") editor.minimize();
  else if (action === "maximize") {
    if (editor.isMaximized()) editor.unmaximize();
    else editor.maximize();
  } else editor.close();
}

export function macroDocument(): MacroBind[] {
  return macros.map((item) => structuredClone(item));
}

/** Writes the editor's list and swaps it into the live hook. */
export async function saveMacroDocument(value: unknown): Promise<MacroBind[]> {
  const next = sanitizeMacros(value);
  stampScans(next);
  macros = next;
  publishHooks();
  if (file) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, serializeMacros(macros), "utf8");
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("macro:changed");
  }
  return macroDocument();
}

/** Replaces the live list with a Macro Bind text file the user picks. */
export async function importMacroFile(): Promise<MacroBind[] | null> {
  const parent = editor && !editor.isDestroyed() ? editor : null;
  const options = {
    title: "Import macros",
    filters: [{ name: "Macro file", extensions: ["txt"] }],
    properties: ["openFile"] as ("openFile")[],
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  const picked = result.filePaths[0];
  if (result.canceled || !picked) return null;
  const text = await fs.readFile(picked, "utf8");
  if (!/^macro\s*$/m.test(text)) throw new Error("That file has no macros.");
  return saveMacroDocument(parseMacros(text));
}

/** Writes the current list to a text file in the Macro Bind format. */
export async function exportMacroFile(): Promise<boolean> {
  const parent = editor && !editor.isDestroyed() ? editor : null;
  const options = {
    title: "Export macros",
    defaultPath: "macros.txt",
    filters: [{ name: "Macro file", extensions: ["txt"] }],
  };
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, serializeMacros(macros), "utf8");
  return true;
}

export async function initMacro(userData: string): Promise<void> {
  file = path.join(userData, "plugins", "macro", "macros.txt");
  await importDesktop();
  await readFile();
  bindMacroToggle(() => {
    const settings = getSettings();
    void setMacroLive(!settings.macroLive);
  });
  bindMacroEditor(openMacroEditor);
  applyMacro(getSettings());
}
