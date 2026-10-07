const GENERIC_DIRS = new Set([
  "binaries",
  "win64",
  "win32",
  "x64",
  "x86",
  "runtime",
  "engine",
  "shipping",
  "application",
  "current",
  "client",
  "bin",
  "redist",
  "launcher",
  "game",
  "windows",
  "app",
  "build",
  "release",
  "program files",
  "program files (x86)",
  "steam",
  "steamapps",
  "common",
  "epic games",
  "users",
  "local",
  "roaming",
]);

export function sanitizeAppName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** True when the file name is an engine or renderer binary, not the game's title. */
export function looksTechnicalExe(name: string): boolean {
  const value = name.toLowerCase();
  if (/shipping|win64|win32|runtimeclient|dx1[12]|easyanticheat/.test(value)) return true;
  if (/^r\d/.test(value)) return true;
  if (value.includes("_") && !value.includes(" ")) return true;
  return false;
}

function humanTitle(name: string | null | undefined, exeName: string): string | null {
  const cleaned = sanitizeAppName(name);
  if (!cleaned) return null;
  const key = cleaned.toLowerCase();
  if (GENERIC_DIRS.has(key)) return null;
  if (/unreal engine|easy anti-cheat|electron/.test(key)) return null;
  if (looksTechnicalExe(cleaned)) return null;
  if (exeName && key === exeName.toLowerCase()) return null;
  return cleaned;
}

/** Store and install folders that are the game's name, such as steamapps/common/Rematch. */
export function titleFromInstallPath(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  const parts = imagePath.split(/[/\\]/).filter(Boolean);
  const file = parts.pop() ?? "";
  const stem = file.replace(/\.exe$/i, "");
  if (!looksTechnicalExe(stem)) return null;
  const steam = parts.findIndex((part, index) =>
    part.toLowerCase() === "common" && parts[index - 1]?.toLowerCase() === "steamapps");
  if (steam >= 0) {
    const title = humanTitle(parts[steam + 1], stem);
    if (title) return title;
  }
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index] ?? "";
    if (GENERIC_DIRS.has(part.toLowerCase())) continue;
    if (/game$/i.test(part) && part.toLowerCase() !== "game") continue;
    const title = humanTitle(part, stem);
    if (title) return title;
  }
  return null;
}

/**
 * The name people see for the app. Cryptic binaries pick the product name
 * or the install folder. A readable executable name stays as it is.
 */
export function displayAppName(
  exeName: string | null | undefined,
  imagePath: string | null | undefined,
  productName: string | null | undefined,
): string {
  const exe = sanitizeAppName(exeName);
  if (exe && !looksTechnicalExe(exe)) return exe;
  return humanTitle(productName, exe) || titleFromInstallPath(imagePath) || exe;
}
