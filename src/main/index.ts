import { app, BrowserWindow, ipcMain, protocol } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { mediaFileResponse } from "./mediaFile";
import { installShell } from "./overlayHost";
import { videoArg } from "./library";
import { hideToTray, registerIpc, revealWindow } from "./ipc";
import { getSettings, initSettings, patchSettings } from "./settings";

app.commandLine.appendSwitch("enable-features", "PlatformHEVCDecoderSupport");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "lumen",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let quitting = false;

function appIcon(): string {
  const packed = path.join(process.resourcesPath, "icon.png");
  if (existsSync(packed)) return packed;
  return path.join(__dirname, "../../build/icon.png");
}

function showMain(): void {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow(true);
  if (!mainWindow) return;
  revealWindow(mainWindow);
}

function queueBoundsSave(): void {
  if (!mainWindow) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    void patchSettings({ windowBounds: bounds });
  }, 300);
}

function createWindow(forceShow = false): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (forceShow) showMain();
    return;
  }
  const startHidden = process.argv.includes("--hidden") && !videoArg(process.argv) && !forceShow;
  const bounds = getSettings().windowBounds;
  const win = new BrowserWindow({
    x: bounds?.x,
    y: bounds?.y,
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: "#06070b",
    show: false,
    title: "Lumen",
    icon: appIcon(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = win;
  win.on("resize", queueBoundsSave);
  win.on("move", queueBoundsSave);
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    hideToTray(win);
  });
  win.on("closed", () => {
    mainWindow = null;
  });
  win.on("enter-full-screen", () => {
    win.webContents.send("window:fullscreen", true);
  });
  win.on("leave-full-screen", () => {
    win.webContents.send("window:fullscreen", false);
  });
  if (!startHidden) win.once("ready-to-show", () => win.show());
  win.webContents.on("console-message", (event) => {
    if (event.message) console.log("renderer:", event.message);
  });
  win.webContents.on("did-fail-load", (_event, code, description) => {
    console.error("renderer failed to load", code, description);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const file = videoArg(argv);
    showMain();
    if (file && mainWindow) mainWindow.webContents.send("lumen:open", file);
  });

  void app.whenReady().then(async () => {
    protocol.handle("lumen", (request) => {
      const filePath = new URL(request.url).searchParams.get("path");
      if (!filePath) return new Response("Missing path", { status: 400 });
      return mediaFileResponse(filePath, request.headers.get("range"), request.signal);
    });

    await initSettings(app.getPath("userData"));
    const userData = app.getPath("userData");
    registerIpc(
      ipcMain,
      () => mainWindow,
      path.join(userData, "playback-cache"),
      path.join(userData, "thumb-cache"),
    );
    app.setAppUserModelId("com.lumen.player");
    createWindow();
    installShell({ iconPath: appIcon(), showPlayer: showMain });
  });

  app.on("before-quit", () => {
    quitting = true;
  });

  app.on("window-all-closed", () => {
    if (quitting) app.quit();
  });
}
