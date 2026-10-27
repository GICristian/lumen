/** One step from a Macro Bind file. Times stay fractional milliseconds. */
export type MacroStep = {
  kind: "down" | "up" | "wait";
  device: "key" | "mouse" | "time";
  vk: number;
  scan: number;
  extended: boolean;
  mouse: string;
  name: string;
  milliseconds: number;
};

export type MacroCard = {
  name: string;
  enabled: boolean;
  bind: string;
  summary: string;
  blocked: string | null;
};

export type MacroBind = {
  name: string;
  enabled: boolean;
  bindKind: "none" | "key" | "mouse";
  bindVk: number;
  bindScan: number;
  bindExtended: boolean;
  bindMouse: string;
  bindName: string;
  steps: MacroStep[];
};

const EXAMPLE = [
  "# Macro Bind",
  "macro",
  "name=Space C",
  "enabled=1",
  "bind=key 67 46 0 C",
  "step=key down 32 57 0 Space",
  "step=wait 6.94",
  "step=key down 67 46 0 C",
  "step=key up 67 46 0 C",
  "step=key up 32 57 0 Space",
].join("\n");

export function exampleMacroText(): string {
  return EXAMPLE;
}

const EXTENDED_VK = new Set([
  0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0x5b, 0x5c, 0x6f, 0xa3, 0xa5,
]);

export function keyExtended(vk: number): boolean {
  return EXTENDED_VK.has(vk);
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cleanStep(value: unknown): MacroStep | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<MacroStep>;
  const kind = raw.kind === "up" || raw.kind === "wait" ? raw.kind : "down";
  if (kind === "wait") {
    return {
      kind,
      device: "time",
      vk: 0,
      scan: 0,
      extended: false,
      mouse: "",
      name: "",
      milliseconds: Math.max(0, finite(raw.milliseconds)),
    };
  }
  const mouse = typeof raw.mouse === "string" ? raw.mouse : "";
  const device = mouse ? "mouse" : "key";
  const vk = finite(raw.vk);
  return {
    kind,
    device,
    vk,
    scan: finite(raw.scan),
    extended: raw.extended === true || keyExtended(vk),
    mouse,
    name: typeof raw.name === "string" ? raw.name.slice(0, 24) : "",
    milliseconds: 0,
  };
}

/** Keeps an edited list inside the Macro Bind shape. */
export function sanitizeMacros(value: unknown): MacroBind[] {
  if (!Array.isArray(value) || value.length === 0) return [emptyMacro()];
  const list: MacroBind[] = [];
  for (const item of value.slice(0, 24)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<MacroBind>;
    const macro = emptyMacro();
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 48) : "";
    macro.name = name || "Macro";
    macro.enabled = raw.enabled !== false;
    macro.bindKind = raw.bindKind === "key" || raw.bindKind === "mouse" ? raw.bindKind : "none";
    macro.bindVk = finite(raw.bindVk);
    macro.bindScan = finite(raw.bindScan);
    macro.bindExtended = raw.bindExtended === true || keyExtended(macro.bindVk);
    macro.bindMouse = typeof raw.bindMouse === "string" ? raw.bindMouse.slice(0, 16) : "";
    macro.bindName = typeof raw.bindName === "string" ? raw.bindName.slice(0, 24) : "";
    macro.steps = Array.isArray(raw.steps)
      ? raw.steps.slice(0, 80).map(cleanStep).filter((step): step is MacroStep => step !== null)
      : [];
    list.push(macro);
  }
  return list.length > 0 ? list : [emptyMacro()];
}

export function emptyMacro(): MacroBind {
  return {
    name: "Macro",
    enabled: true,
    bindKind: "none",
    bindVk: 0,
    bindScan: 0,
    bindExtended: false,
    bindMouse: "",
    bindName: "",
    steps: [],
  };
}

function parseMs(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function readBind(macro: MacroBind, value: string): void {
  if (value.startsWith("key ")) {
    const parts = value.slice(4).split(" ");
    if (parts.length < 4) return;
    macro.bindKind = "key";
    macro.bindVk = Number(parts[0]);
    macro.bindScan = Number(parts[1]);
    macro.bindExtended = parts[2] === "1";
    macro.bindName = parts.slice(3).join(" ");
    return;
  }
  if (value.startsWith("mouse ")) {
    const parts = value.slice(6).split(" ");
    macro.bindKind = "mouse";
    macro.bindMouse = parts[0] ?? "";
    macro.bindName = parts.slice(1).join(" ") || macro.bindMouse;
  }
}

function readStep(macro: MacroBind, value: string): void {
  if (value.startsWith("wait ")) {
    const ms = parseMs(value.slice(5));
    if (ms === null) return;
    macro.steps.push({
      kind: "wait",
      device: "time",
      vk: 0,
      scan: 0,
      extended: false,
      mouse: "",
      name: "",
      milliseconds: ms,
    });
    return;
  }
  if (value.startsWith("key ")) {
    const parts = value.slice(4).split(" ");
    if (parts.length < 5) return;
    const kind = parts[0] === "up" ? "up" : "down";
    macro.steps.push({
      kind,
      device: "key",
      vk: Number(parts[1]),
      scan: Number(parts[2]),
      extended: parts[3] === "1",
      mouse: "",
      name: parts.slice(4).join(" "),
      milliseconds: 0,
    });
    return;
  }
  if (value.startsWith("mouse ")) {
    const parts = value.slice(6).split(" ");
    if (parts.length < 2) return;
    const kind = parts[0] === "up" ? "up" : "down";
    macro.steps.push({
      kind,
      device: "mouse",
      vk: 0,
      scan: 0,
      extended: false,
      mouse: parts[1] ?? "",
      name: parts.slice(2).join(" ") || parts[1] || "",
      milliseconds: 0,
    });
  }
}

/** Reads the Macro Bind text format. A missing file becomes the Space C example. */
export function parseMacros(text: string): MacroBind[] {
  const list: MacroBind[] = [];
  let current: MacroBind | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line === "macro") {
      current = emptyMacro();
      list.push(current);
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === "name") current.name = value || "Macro";
    else if (key === "enabled") current.enabled = value !== "0";
    else if (key === "bind") readBind(current, value);
    else if (key === "step") readStep(current, value);
  }
  if (list.length === 0) return parseMacros(EXAMPLE);
  return list;
}

function formatMs(ms: number): string {
  return ms.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** Writes the same text format Macro Bind saves. */
export function serializeMacros(macros: MacroBind[]): string {
  const lines = ["# Macro Bind"];
  for (const macro of macros) {
    lines.push("macro");
    lines.push(`name=${macro.name.replace(/[\r\n]/g, " ").trim() || "Macro"}`);
    lines.push(`enabled=${macro.enabled ? "1" : "0"}`);
    lines.push(`bind=${bindText(macro)}`);
    for (const step of macro.steps) lines.push(`step=${stepText(step)}`);
  }
  return lines.join("\n");
}

function bindText(macro: MacroBind): string {
  if (macro.bindKind === "key") {
    const flag = macro.bindExtended ? "1" : "0";
    return `key ${macro.bindVk} ${macro.bindScan} ${flag} ${macro.bindName}`;
  }
  if (macro.bindKind === "mouse") return `mouse ${macro.bindMouse} ${macro.bindName}`;
  return "none";
}

function stepText(step: MacroStep): string {
  if (step.kind === "wait") return `wait ${formatMs(step.milliseconds)}`;
  if (step.device === "mouse") return `mouse ${step.kind} ${step.mouse} ${step.name}`;
  const flag = step.extended ? "1" : "0";
  return `key ${step.kind} ${step.vk} ${step.scan} ${flag} ${step.name}`;
}

export function describeMacro(macro: MacroBind): string {
  return macro.steps.map((step) => {
    if (step.kind === "wait") return `${formatMs(step.milliseconds)} ms`;
    const mark = step.kind === "down" ? "down" : "up";
    return `${step.name || "?"} ${mark}`;
  }).join("  ->  ");
}

/** True when this bind is the same key as a Lumen shortcut, modifiers included. */
export function bindConflicts(macro: MacroBind, accelerator: string): boolean {
  if (macro.bindKind !== "key" || !accelerator) return false;
  const parts = accelerator.split("+");
  const key = parts[parts.length - 1] ?? "";
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  if (vk !== macro.bindVk) return false;
  const modified = parts.length > 1;
  return !modified;
}
