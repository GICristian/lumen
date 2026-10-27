import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app, net } from "electron";

const PACK_URL = "https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack43.zip";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let errorText = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      errorText += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorText.trim() || `Command failed (${code ?? "unknown"}).`));
    });
  });
}

function quote(value: string): string {
  return value.replace(/'/g, "''");
}

async function findSetup(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findSetup(full);
      if (nested) return nested;
    } else if (entry.name.toLowerCase() === "vbcable_setup_x64.exe") return full;
  }
  return null;
}

/** Downloads VB-Audio's virtual cable and asks Windows to install it. */
export async function installVoiceCable(): Promise<string> {
  const dir = path.join(app.getPath("userData"), "voice-cable");
  await fs.mkdir(dir, { recursive: true });
  const zipPath = path.join(dir, "VBCABLE_Driver_Pack.zip");
  const response = await net.fetch(PACK_URL);
  if (!response.ok) throw new Error("The voice cable download did not start.");
  await fs.writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
  const expand = "Expand-Archive -Force -LiteralPath "
    + `'${quote(zipPath)}' -DestinationPath '${quote(dir)}'`;
  await run("powershell.exe", ["-NoProfile", "-Command", expand]);
  const setup = await findSetup(dir);
  if (!setup) throw new Error("The voice cable installer was not in the download.");
  const launch = "Start-Process -FilePath "
    + `'${quote(setup)}' -ArgumentList '-i','-h' -Verb RunAs -Wait`;
  await run("powershell.exe", ["-NoProfile", "-Command", launch]);
  return "Voice cable installed. In Discord, set the input device to CABLE Output. "
    + "A restart may be needed before Windows shows it.";
}
