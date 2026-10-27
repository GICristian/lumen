import { spawnSync } from "node:child_process";
import { app } from "electron";
import path from "node:path";

function restoreFile(): string {
  return path.join(app.getPath("userData"), "voice-route.json");
}

function quote(value: string): string {
  return value.replace(/'/g, "''");
}

/** Points the default microphone at the cable, or puts the saved microphone back. */
function script(mode: "engage" | "restore"): string {
  return `
$ErrorActionPreference = 'Stop'
$mode = '${mode}'
$file = '${quote(restoreFile())}'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LumenAudioRoute {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class Enumerator { }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IEnum {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IDevice device);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IDevice device);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr p, out IntPtr iface);
    int OpenPropertyStore(int access, out IntPtr store);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out int state);
  }
  [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
  class Policy { }
  [Guid("f8679f50-850a-41cf-9c72-430f290290c8")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPolicy {
    int Dummy1(); int Dummy2(); int Dummy3(); int Dummy4(); int Dummy5();
    int Dummy6(); int Dummy7(); int Dummy8(); int Dummy9(); int Dummy10();
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
  }
  public static string Defaults() {
    var e = (IEnum)new Enumerator();
    var parts = new string[3];
    for (int role = 0; role < 3; role++) {
      IDevice dev;
      int hr = e.GetDefaultAudioEndpoint(1, role, out dev);
      string id = "";
      if (hr == 0 && dev != null) dev.GetId(out id);
      if (hr != 0 || string.IsNullOrEmpty(id)) throw new Exception("default " + role);
      parts[role] = id;
    }
    return string.Join("|", parts);
  }
  public static void Apply(string joined) {
    var policy = (IPolicy)new Policy();
    var parts = joined.Split('|');
    if (parts.Length != 3) throw new Exception("roles");
    for (int role = 0; role < 3; role++) {
      int hr = policy.SetDefaultEndpoint(parts[role], role);
      if (hr != 0) throw new Exception("set " + role + " " + hr);
    }
  }
}
'@
function Assert-Capture([string]$id) {
  if ($id -notmatch '^\\{0\\.0\\.1\\.00000000\\}\\.\\{[0-9a-fA-F-]{36}\\}$') {
    throw "not a capture device"
  }
}
if ($mode -eq 'restore') {
  if (-not (Test-Path -LiteralPath $file)) { Write-Output 'absent'; exit 0 }
  $saved = @( (Get-Content -LiteralPath $file -Raw | ConvertFrom-Json).roles )
  if ($saved.Count -ne 3) { throw 'saved microphone list is incomplete' }
  $saved | ForEach-Object { Assert-Capture $_ }
  [LumenAudioRoute]::Apply(($saved -join '|'))
  Remove-Item -LiteralPath $file -Force
  Write-Output 'restored'
  exit 0
}
$root = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Capture'
$prop = '{a45c254e-df1c-4efd-8020-67d146a850e0},2'
$devices = @()
Get-ChildItem $root | ForEach-Object {
  $state = (Get-ItemProperty $_.PSPath).DeviceState
  if ($state -ne 1) { return }
  $store = Get-ItemProperty (Join-Path $_.PSPath 'Properties')
  $devices += [pscustomobject]@{
    Name = [string]$store.$prop
    Id = '{0.0.1.00000000}.' + $_.PSChildName
  }
}
$cableRow = $devices | Where-Object { $_.Name -eq 'CABLE Output' } | Select-Object -First 1
$micRow = $devices | Where-Object { $_.Name -ne 'CABLE Output' } | Select-Object -First 1
$cable = ''
$mic = ''
if ($cableRow) { $cable = [string]$cableRow.Id }
if ($micRow) { $mic = [string]$micRow.Id }
if (-not $cable) { throw 'voice cable capture was not found' }
Assert-Capture $cable
if (-not (Test-Path -LiteralPath $file)) {
  $defaults = @([LumenAudioRoute]::Defaults().Split('|'))
  $kept = @()
  foreach ($id in $defaults) {
    Assert-Capture $id
    if ($id -eq $cable) {
      if (-not $mic) { throw 'the microphone is already the voice cable' }
      Assert-Capture $mic
      $kept += $mic
    } else { $kept += $id }
  }
  $dir = Split-Path -Parent $file
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $json = @{ roles = @($kept) } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($file, $json)
}
[LumenAudioRoute]::Apply("$cable|$cable|$cable")
Write-Output 'engaged'
`.trim();
}

function run(mode: "engage" | "restore"): string {
  const encoded = Buffer.from(script(mode), "utf16le").toString("base64");
  const args = ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded];
  const result = spawnSync("powershell.exe", args, { windowsHide: true, encoding: "utf8" });
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}${result.stdout || ""}`.trim();
    throw new Error(detail || "voice route failed");
  }
  return result.stdout ?? "";
}

/** Puts the real microphone back. The cable stays a mix target, not the system default. */
export function restoreDiscordInput(): void {
  if (process.platform !== "win32") return;
  try {
    run("restore");
  } catch (error) {
    console.error("voice route restore", error);
  }
}
