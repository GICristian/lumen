export type KeyAction =
  | { type: "seek"; direction: -1 | 1; fine: boolean }
  | { type: "volume"; direction: -1 | 1 }
  | { type: "sibling"; direction: -1 | 1 }
  | { type: "toggle-play" }
  | { type: "toggle-loop" }
  | { type: "mark"; which: "a" | "b" }
  | { type: "fullscreen" }
  | { type: "folder" }
  | { type: "crop" }
  | { type: "export" }
  | { type: "escape" }
  | { type: "home" }
  | { type: "end" }
  | { type: "zoom"; direction: -1 | 1 }
  | { type: "zoom-reset" };

type KeyTarget = { tagName?: string; isContentEditable?: boolean; inputType?: string };

export function keyAction(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  target: KeyTarget | null;
}): KeyAction | null {
  const tag = event.target?.tagName?.toUpperCase();
  const typing =
    tag === "TEXTAREA" ||
    event.target?.isContentEditable ||
    (tag === "INPUT" && event.target?.inputType !== "range");
  if (typing) return null;
  if (event.altKey) return null;
  const fine = !event.shiftKey;

  if (event.ctrlKey || event.metaKey) {
    if (event.key === "ArrowLeft") return { type: "sibling", direction: -1 };
    if (event.key === "ArrowRight") return { type: "sibling", direction: 1 };
    return null;
  }

  switch (event.key) {
    case "ArrowLeft":
      return { type: "seek", direction: -1, fine };
    case "ArrowRight":
      return { type: "seek", direction: 1, fine };
    case "ArrowUp":
      return { type: "volume", direction: 1 };
    case "ArrowDown":
      return { type: "volume", direction: -1 };
    case " ":
      return { type: "toggle-play" };
    case "l":
    case "L":
      return { type: "toggle-loop" };
    case "i":
    case "I":
      return { type: "mark", which: "a" };
    case "o":
    case "O":
      return { type: "mark", which: "b" };
    case "f":
    case "F":
      return { type: "fullscreen" };
    case "m":
    case "M":
      return { type: "folder" };
    case "c":
    case "C":
      return { type: "crop" };
    case "Enter":
      return { type: "export" };
    case "Escape":
      return { type: "escape" };
    case "Home":
      return { type: "home" };
    case "End":
      return { type: "end" };
    case "=":
    case "+":
      return { type: "zoom", direction: 1 };
    case "-":
    case "_":
      return { type: "zoom", direction: -1 };
    case "0":
      return { type: "zoom-reset" };
    default:
      return null;
  }
}
