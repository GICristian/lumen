import path from "node:path";

type PathApi = {
  dirname: (value: string) => string;
  basename: (value: string, suffix?: string) => string;
  extname: (value: string) => string;
  join: (...parts: string[]) => string;
};

function pathApi(sourcePath: string): PathApi {
  return /^[A-Za-z]:/.test(sourcePath) ? path.win32 : path.posix;
}

export function nextOutputPath(
  sourcePath: string,
  suffix: "trim" | "edit",
  existingNames: string[],
): string {
  const api = pathApi(sourcePath);
  const dir = api.dirname(sourcePath);
  const stem = api.basename(sourcePath, api.extname(sourcePath));
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));

  for (let n = 1; n < 10000; n += 1) {
    const name = n === 1 ? `${stem}_${suffix}.mp4` : `${stem}_${suffix}_${n}.mp4`;
    if (taken.has(name.toLowerCase())) continue;
    const full = api.join(dir, name);
    if (full.toLowerCase() === sourcePath.toLowerCase()) continue;
    return full;
  }

  throw new Error("No free export name");
}
