export type ActivityKind = "recorded" | "exported";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  path: string;
  at: number;
};

const ACTIVITY_LIMIT = 5;

export function normalizeActivity(raw: unknown): ActivityItem[] {
  if (!Array.isArray(raw)) return [];
  const next: ActivityItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ActivityItem>;
    if (row.kind !== "recorded" && row.kind !== "exported") continue;
    if (typeof row.path !== "string" || !row.path.trim()) continue;
    if (typeof row.at !== "number" || !Number.isFinite(row.at)) continue;
    next.push({
      id: typeof row.id === "string" && row.id ? row.id : `${row.kind}:${row.at}`,
      kind: row.kind,
      path: row.path.trim(),
      at: row.at,
    });
    if (next.length >= ACTIVITY_LIMIT) break;
  }
  return next;
}

export function pushActivity(
  items: readonly ActivityItem[],
  entry: { kind: ActivityKind; path: string; at: number },
): ActivityItem[] {
  const path = entry.path.trim();
  if (!path) return [...items];
  const next: ActivityItem = {
    id: `${entry.kind}:${entry.at}:${path}`,
    kind: entry.kind,
    path,
    at: entry.at,
  };
  return [next, ...items.filter((item) => item.path !== path || item.kind !== entry.kind)]
    .slice(0, ACTIVITY_LIMIT);
}
