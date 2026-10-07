import { app, BrowserWindow, ipcMain, protocol } from "electron";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { mediaFileResponse } from "./mediaFile";
import { installShell } from "./overlayHost";
import { initReplay, stopReplay } from "./replayHost";
import { initVault, vaultLock } from "./vault";
import { videoArg } from "./library";
import { hideToTray, registerIpc, revealWindow } from "./ipc";
import { getSettings, initSettings, patchSettings } from "./settings";
import { initFavorites } from "./favorites";
import { initActivity } from "./activity";
import { initLumenFolders } from "./lumenFolders";
import { initUpdateNotice, initUpdates } from "./updates";

app.commandLine.appendSwitch("enable-features", "PlatformHEVCDecoderSupport");
app.commandLine.appendSwitch(
  "disable-features",
  "CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,ThrottleForegroundTimers",
);

const RELAUNCH_TASK = "LumenUser";

function runningElevated(): boolean {
  if (process.platform !== "win32") return false;
  const result = spawnSync("net", ["session"], { stdio: "ignore", windowsHide: true });
  return result.status === 0;
}

/** Windows denies screen capture to an administrator process. Start as the user. */
function relaunchAtUserLevel(): boolean {
  const exe = process.execPath;
  spawnSync("schtasks", ["/Delete", "/TN", RELAUNCH_TASK, "/F"], { stdio: "ignore", windowsHide: true });
  const created = spawnSync("schtasks", [
    "/Create", "/TN", RELAUNCH_TASK, "/TR", `"${exe}"`,
    "/SC", "ONCE", "/ST", "00:00", "/RL", "LIMITED", "/F",
  ], { stdio: "ignore", windowsHide: true });
  if (created.status !== 0) return false;
  const ran = spawnSync("schtasks", ["/Run", "/TN", RELAUNCH_TASK], { stdio: "ignore", windowsHide: true });
  return ran.status === 0;
}

const handingOff = runningElevated() && relaunchAtUserLevel();
if (handingOff) app.exit(0);
else if (process.platform === "win32") {
  spawnSync("schtasks", ["/Delete", "/TN", RELAUNCH_TASK, "/F"], { stdio: "ignore", windowsHide: true });
}

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

function showHub(): void {
  showMain();
  mainWindow?.webContents.send("lumen:home");
}

function queueBoundsSave(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized() || mainWindow.isFullScreen()) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
    const bounds = mainWindow.getBounds();
    if (bounds.x < 0 || bounds.y < 0) return;
    void patchSettings({ windowBounds: bounds, windowMaximized: false });
  }, 300);
}

function createWindow(forceShow = false): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (forceShow) showMain();
    return;
  }
  const startHidden = process.argv.includes("--hidden") && !videoArg(process.argv) && !forceShow;
  const settings = getSettings();
  const bounds = settings.windowBounds;
  const restored = bounds && bounds.x >= 0 && bounds.y >= 0 ? bounds : null;
  const win = new BrowserWindow({
    x: settings.windowMaximized ? undefined : restored?.x,
    y: settings.windowMaximized ? undefined : restored?.y,
    width: restored?.width ?? 1280,
    height: restored?.height ?? 800,
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
  win.on("maximize", () => {
    void patchSettings({ windowMaximized: true });
  });
  win.on("unmaximize", () => {
    if (win.isDestroyed()) return;
    const next = win.getBounds();
    const patch: { windowMaximized: false; windowBounds?: typeof next } = {
      windowMaximized: false,
    };
    if (next.x >= 0 && next.y >= 0) patch.windowBounds = next;
    void patchSettings(patch);
  });
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
  if (!startHidden) {
    win.once("ready-to-show", () => {
      if (getSettings().windowMaximized) win.maximize();
      win.show();
    });
  }
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

const gotLock = handingOff ? false : app.requestSingleInstanceLock();
if (handingOff) {
  // The user-level process is the one that keeps running.
} else if (!gotLock) {
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
    await initFavorites(app.getPath("userData"));
    await initActivity(app.getPath("userData"));
    await initLumenFolders(app.getPath("userData"));
    const userData = app.getPath("userData");
    await initVault(path.join(userData, "store"));
    registerIpc(
      ipcMain,
      () => mainWindow,
      path.join(userData, "playback-cache"),
      path.join(userData, "thumb-cache"),
    );
    app.setAppUserModelId("com.lumen.player");
    createWindow();
    installShell({
      iconPath: appIcon(),
      showPlayer: showHub,
      showVault: () => {
        showMain();
        mainWindow?.webContents.send("vault:open");
      },
    });
    ipcMain.handle("studio:open", (_event, filePath: unknown) => {
      showMain();
      const clip = typeof filePath === "string" ? filePath : "";
      mainWindow?.webContents.send("studio:open", clip);
    });
    initReplay(path.join(userData, "replay-buffer"));
    await initUpdateNotice(userData);
    initUpdates(() => {
      quitting = true;
      stopReplay();
    });
  });

  app.on("before-quit", () => {
    quitting = true;
    stopReplay();
    void vaultLock();
  });

  app.on("window-all-closed", () => {
    if (quitting) app.quit();
  });
}
