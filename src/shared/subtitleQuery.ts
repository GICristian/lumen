const noise =
  /\b(1080p|720p|2160p|480p|4k|uhd|bluray|brrip|bdrip|webrip|webdl|hdtv|dvdrip|hdrip|x264|x265|h264|h265|hevc|aac|dts|ddp|atmos|remux|extended|proper|repack|10bit|8bit|hdr|sdr)\b/gi;

/**
 * OpenSubtitles redirects spaced or mixed-case queries to a broken host.
 * A lowercase hyphen token stays on the real server and still matches the title.
 */
export function subtitleQuery(raw: string): string {
  return raw
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(noise, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
