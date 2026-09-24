import { useRef, useState } from "react";
import { rangeSelection, toggleSelection } from "@shared/selection";

export function useClipSelection(order: string[]): {
  selected: string[];
  pick: (path: string, extend: boolean) => void;
  clear: () => void;
} {
  const anchor = useRef<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const visible = selected.filter((path) => order.includes(path));

  function pick(path: string, extend: boolean): void {
    setSelected((current) => {
      const kept = current.filter((item) => order.includes(item));
      const next = extend
        ? rangeSelection(order, anchor.current, path, kept)
        : toggleSelection(kept, path);
      anchor.current = path;
      return next;
    });
  }

  function clear(): void {
    anchor.current = null;
    setSelected([]);
  }

  return { selected: visible, pick, clear };
}
