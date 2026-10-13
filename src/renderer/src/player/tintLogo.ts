import { THEME_PRESETS } from "@shared/theme";

const cache = new Map<string, string>();

function channel(hex: string, index: number): number {
  return Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  if (max === min) return [0, 0, light];
  const delta = max - min;
  const sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return [hue / 6, sat, light];
}

function hslToRgb(hue: number, sat: number, light: number): [number, number, number] {
  if (sat === 0) {
    const gray = Math.round(light * 255);
    return [gray, gray, gray];
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const convert = (t: number): number => {
    let turn = t;
    if (turn < 0) turn += 1;
    if (turn > 1) turn -= 1;
    if (turn < 1 / 6) return p + (q - p) * 6 * turn;
    if (turn < 1 / 2) return q;
    if (turn < 2 / 3) return p + (q - p) * (2 / 3 - turn) * 6;
    return p;
  };
  return [
    Math.round(convert(hue + 1 / 3) * 255),
    Math.round(convert(hue) * 255),
    Math.round(convert(hue - 1 / 3) * 255),
  ];
}

function hueOf(hex: string): number {
  return rgbToHsl(channel(hex, 0), channel(hex, 1), channel(hex, 2))[0];
}

function authoredGold(accent: string, accent2: string): boolean {
  const gold = THEME_PRESETS.gold;
  return accent.toLowerCase() === gold.accent && accent2.toLowerCase() === gold.accent2;
}

/** Recolors the warm rim of the mark and leaves the dark metal and highlights. */
export function tintLogo(url: string, accent: string, accent2: string): Promise<string> {
  const key = `${url}|${accent}|${accent2}`;
  const saved = cache.get(key);
  if (saved) return Promise.resolve(saved);
  if (authoredGold(accent, accent2)) {
    cache.set(key, url);
    return Promise.resolve(url);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(url);
        return;
      }
      context.drawImage(image, 0, 0);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const hueA = hueOf(accent);
      const hueB = hueOf(accent2);
      const data = frame.data;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] < 8) continue;
        const [hue, sat, light] = rgbToHsl(data[index], data[index + 1], data[index + 2]);
        const warm = sat > 0.15 && hue > 0.02 && hue < 0.18;
        if (!warm || light > 0.94) continue;
        const next = hslToRgb(light > 0.62 ? hueA : hueB, Math.min(0.95, Math.max(sat, 0.35)), light);
        data[index] = next[0];
        data[index + 1] = next[1];
        data[index + 2] = next[2];
      }
      context.putImageData(frame, 0, 0);
      const painted = canvas.toDataURL("image/png");
      cache.set(key, painted);
      resolve(painted);
    };
    image.onerror = () => resolve(url);
    image.src = url;
  });
}
