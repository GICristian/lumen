export function toggleSelection(selected: string[], path: string): string[] {
  if (selected.includes(path)) return selected.filter((item) => item !== path);
  return [...selected, path];
}

export function rangeSelection(
  order: string[],
  anchor: string | null,
  path: string,
  selected: string[],
): string[] {
  if (!anchor) return toggleSelection(selected, path);
  const start = order.indexOf(anchor);
  const end = order.indexOf(path);
  if (start < 0 || end < 0) return toggleSelection(selected, path);
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const chosen = new Set(selected);
  for (const item of order.slice(from, to + 1)) chosen.add(item);
  return order.filter((item) => chosen.has(item));
}
