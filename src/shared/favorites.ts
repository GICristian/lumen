const FAVORITE_LIMIT = 2000;

/** Windows paths compare the same whether the separators or letter case differ. */
export function favoriteKey(filePath: string): string {
  return filePath.trim().replace(/[\\/]+$/, "").replace(/\//g, "\\").toLowerCase();
}

export function normalizeFavorites(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !item.trim()) continue;
    const key = favoriteKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item.trim());
    if (next.length >= FAVORITE_LIMIT) break;
  }
  return next;
}

export function isFavorite(paths: readonly string[], filePath: string): boolean {
  const key = favoriteKey(filePath);
  return paths.some((item) => favoriteKey(item) === key);
}

export function toggleFavorite(paths: readonly string[], filePath: string): string[] {
  const key = favoriteKey(filePath);
  if (paths.some((item) => favoriteKey(item) === key)) {
    return paths.filter((item) => favoriteKey(item) !== key);
  }
  return [filePath.trim(), ...paths].slice(0, FAVORITE_LIMIT);
}

export function replacePathPrefix(filePath: string, fromDir: string, toDir: string): string {
  const from = fromDir.replace(/[\\/]+$/, "").replace(/\//g, "\\");
  const to = toDir.replace(/[\\/]+$/, "").replace(/\//g, "\\");
  const current = filePath.replace(/\//g, "\\");
  const lower = current.toLowerCase();
  const fromLower = from.toLowerCase();
  if (lower === fromLower) return to;
  if (!lower.startsWith(`${fromLower}\\`)) return filePath;
  return to + current.slice(from.length);
}

export function dropFavorites(paths: readonly string[], gone: readonly string[]): string[] {
  const keys = new Set(gone.map((item) => favoriteKey(item)));
  return paths.filter((item) => !keys.has(favoriteKey(item)));
}
