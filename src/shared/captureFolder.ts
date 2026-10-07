import { looksTechnicalExe } from "./appTitle";

const DESKTOP_APPS = new Set([
  "explorer",
  "searchhost",
  "startmenuexperiencehost",
  "shellexperiencehost",
  "applicationframehost",
  "textinputhost",
  "systemsettings",
  "lockapp",
  "sihost",
  "dwm",
  "chrome",
  "msedge",
  "firefox",
  "brave",
  "opera",
  "vivaldi",
  "browser",
  "arc",
  "waterfox",
  "librewolf",
  "chromium",
  "thorium",
  "totalcmd",
  "doublecmd",
  "xyplorer",
  "xplorer2",
  "q-dir",
  "discord",
  "discordcanary",
  "discordptb",
  "vesktop",
  "armcord",
  "webcord",
  "slack",
  "teams",
  "telegram",
  "whatsapp",
  "signal",
  "zoom",
  "skype",
  "spotify",
  "steam",
  "steamwebhelper",
  "epicgameslauncher",
  "eadesktop",
  "riotclientservices",
  "riotclientux",
  "code",
  "cursor",
  "windowsterminal",
  "obs64",
  "obs32",
]);

const GAME_EXES = new Set(["osu!", "osu"]);

function sanitizeAppName(name: string | null): string {
  if (!name) return "";
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function gameInstall(imagePath: string): boolean {
  const parts = imagePath.split(/[/\\]/).map((part) => part.toLowerCase());
  const steam = parts.findIndex((part, index) =>
    part === "common" && parts[index - 1] === "steamapps");
  if (steam >= 0 && parts[steam + 1]) return true;
  const epic = parts.indexOf("epic games");
  if (epic >= 0 && parts[epic + 1] && parts[epic + 1] !== "launcher") return true;
  if (parts.includes("osulazer")) return true;
  if (parts.includes("gog games") || parts.includes("xboxgames")) return true;
  const riot = parts.indexOf("riot games");
  if (riot >= 0 && parts[riot + 1]) return true;
  return false;
}

/** Browsers, chat apps, and the desktop itself. These never get their own folder. */
export function isDesktopApp(name: string | null): boolean {
  const exe = sanitizeAppName(name).toLowerCase();
  return exe !== "" && DESKTOP_APPS.has(exe);
}

/** True when the focused program is a game, not a normal application. */
export function isGameCapture(exeName: string | null, imagePath: string | null): boolean {
  const exe = sanitizeAppName(exeName).toLowerCase();
  if (!exe || DESKTOP_APPS.has(exe)) return false;
  if (GAME_EXES.has(exe) || looksTechnicalExe(exe)) return true;
  return imagePath ? gameInstall(imagePath) : false;
}

/**
 * Games get a folder named for the game. Every other focused app,
 * including one that covers the monitor, saves into Desktop.
 */
export function replayFolderName(
  exeName: string | null,
  displayName?: string | null,
  imagePath?: string | null,
): string {
  const exe = sanitizeAppName(exeName);
  const display = sanitizeAppName(displayName ?? "") || exe;
  if (!isGameCapture(exe, imagePath ?? null)) return "Desktop";
  return display || "Desktop";
}
