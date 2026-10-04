import { spawn } from "node:child_process";
import https from "node:https";
import { gunzipSync } from "node:zlib";
import { bestOffset, parseVtt, speechFromLog } from "@shared/cues";
import { srtToVtt } from "@shared/srt";
import { subtitleQuery } from "@shared/subtitleQuery";
import { ffmpegBinary } from "./ffmpeg";

export type SubtitleHit = {
  id: string;
  title: string;
  fileName: string;
  language: string;
  downloads: number;
  url: string;
};

const agent = "Lumen v0.1";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function allowedHost(hostname: string): boolean {
  return hostname === "rest.opensubtitles.org" || hostname === "dl.opensubtitles.org";
}

function readHttps(target: string, redirects = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      reject(new Error("Subtitle link is invalid"));
      return;
    }
    if (parsed.protocol !== "https:" || !allowedHost(parsed.hostname)) {
      reject(new Error("Subtitle link is invalid"));
      return;
    }
    const req = https.get(
      parsed,
      { headers: { "User-Agent": agent, Accept: "application/json" } },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume();
          if (redirects >= 3) {
            reject(new Error("Subtitle server redirected too many times"));
            return;
          }
          const next = new URL(location, parsed);
          if (!allowedHost(next.hostname)) {
            reject(new Error("OpenSubtitles could not search that title"));
            return;
          }
          resolve(readHttps(next.toString(), redirects + 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          if (status < 200 || status >= 300) {
            reject(new Error("Subtitle request failed"));
            return;
          }
          resolve(Buffer.concat(chunks));
        });
      },
    );
    req.on("error", () => reject(new Error("Could not reach OpenSubtitles")));
  });
}

export async function searchSubtitles(
  query: string,
  language: string,
): Promise<SubtitleHit[]> {
  const token = subtitleQuery(query);
  if (token.length < 2) return [];
  const lang = language === "rum" ? "rum" : "eng";
  const url =
    `https://rest.opensubtitles.org/search/query-${token}/sublanguageid-${lang}`;
  const body = await readHttps(url);
  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("Subtitle search returned an unexpected response");
  }
  if (!Array.isArray(payload)) return [];
  const hits = payload.flatMap((entry) => {
    const row = asRecord(entry);
    if (!row) return [];
    const download = text(row.SubDownloadLink);
    if (!download.startsWith("https://dl.opensubtitles.org/")) return [];
    const year = text(row.MovieYear);
    const movie = text(row.MovieName) || text(row.MovieNameEng);
    const title = year ? `${movie} (${year})` : movie;
    return [{
      id: text(row.IDSubtitleFile) || download,
      title: title || text(row.SubFileName),
      fileName: text(row.SubFileName),
      language: text(row.LanguageName) || lang,
      downloads: Number(row.SubDownloadsCnt) || 0,
      url: download,
    }];
  });
  hits.sort((left, right) => right.downloads - left.downloads);
  return hits.slice(0, 15);
}

export async function fetchSubtitle(url: string): Promise<string> {
  const bytes = await readHttps(url);
  const packed = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const raw = packed ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8");
  return srtToVtt(raw);
}

function silenceLog(filePath: string, seconds: number): Promise<string> {
  const limit = Math.max(30, Math.min(seconds || 720, 720));
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegBinary(),
      [
        "-hide_banner",
        "-t",
        String(limit),
        "-i",
        filePath,
        "-vn",
        "-af",
        "silencedetect=noise=-30dB:d=0.4",
        "-f",
        "null",
        "-",
      ],
      { windowsHide: true },
    );
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 45000);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("ffmpeg is not available"));
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (!/Audio:/.test(stderr) && !/silence_/.test(stderr)) {
        reject(new Error("This clip has no audio to sync against"));
        return;
      }
      resolve(stderr);
    });
  });
}

export async function syncSubtitles(
  filePath: string,
  vtt: string,
  duration: number,
): Promise<number> {
  const window = Math.max(30, Math.min(duration || 720, 720));
  const cues = parseVtt(vtt).filter((cue) => cue.start < window);
  if (cues.length < 3) throw new Error("Not enough subtitle lines to sync");
  const log = await silenceLog(filePath, window);
  const speech = speechFromLog(log, window);
  if (speech.length === 0) throw new Error("No speech found in the audio");
  return bestOffset(cues, speech);
}
