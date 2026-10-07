import type { UpdateState } from "./contracts";

export const idleUpdate: UpdateState = {
  phase: "idle",
  version: null,
  percent: 0,
  dismissed: false,
  message: null,
};

/** The notice stays until the user closes an available release. */
export function updateVisible(state: UpdateState): boolean {
  if (state.phase === "idle") return false;
  if (state.phase === "available" && state.dismissed) return false;
  return true;
}

export function updateTitle(state: UpdateState): string {
  if (state.phase === "error") return shortMessage(state.message);
  if (state.phase === "downloading" || state.phase === "ready") {
    return state.version ? `Installing ${state.version}` : "Installing the update";
  }
  return state.version ? `Lumen ${state.version} is available` : "A new Lumen is available";
}

export function updateLabel(state: UpdateState): string {
  if (state.phase === "downloading") return `Downloading ${percent(state.percent)}%`;
  if (state.phase === "ready") return "Restarting…";
  if (state.phase === "error") return "Try again";
  return "Update";
}

function percent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function shortMessage(message: string | null): string {
  const line = message?.split("\n")[0]?.trim() || "The update did not finish.";
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}
