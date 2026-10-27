import type { MacroBind } from "@shared/macros";

const MAP_AT = 8;
const MACRO_AT = MAP_AT + 256;
const STEP_FIELDS = 6;
const MAX_STEPS = 80;
const MAX_MACROS = 24;
const STRIDE = 1 + MAX_STEPS * STEP_FIELDS;

/** Shared table size, in bytes. The hook and the player both read this buffer. */
export const TABLE_BYTES = (MACRO_AT + MAX_MACROS * STRIDE) * 4;

const MOUSE_CODE: Record<string, number> = {
  left: 1,
  right: 2,
  middle: 3,
  x1: 4,
  x2: 5,
};

export type PlayStep = {
  kind: number;
  device: number;
  vk: number;
  scan: number;
  extended: number;
  extra: number;
};

/**
 * Publishes the live binds. An odd sequence means a reader should try again.
 * Virtual-key slots store the macro index plus one.
 */
export function publishTable(
  view: Int32Array,
  macros: MacroBind[],
  live: boolean,
  powerVk: number,
  playable: (macro: MacroBind, index: number) => boolean,
): void {
  const scratch = new Int32Array(view.length);
  const count = Math.min(macros.length, MAX_MACROS);
  scratch[1] = live ? 1 : 0;
  scratch[2] = powerVk > 0 && powerVk < 256 ? powerVk : 0;
  scratch[3] = count;
  scratch[4] = MAP_AT;
  scratch[5] = MACRO_AT;
  scratch[6] = STRIDE;
  for (let index = 0; index < count; index += 1) {
    const macro = macros[index];
    const base = MACRO_AT + index * STRIDE;
    const steps = macro.steps.slice(0, MAX_STEPS);
    scratch[base] = steps.length;
    steps.forEach((step, stepIndex) => {
      const at = base + 1 + stepIndex * STEP_FIELDS;
      if (step.kind === "wait") {
        scratch[at] = 3;
        scratch[at + 5] = Math.round(step.milliseconds * 1000);
        return;
      }
      scratch[at] = step.kind === "up" ? 2 : 1;
      if (step.device === "mouse") {
        scratch[at + 1] = 2;
        scratch[at + 5] = MOUSE_CODE[step.mouse] ?? 0;
        return;
      }
      scratch[at + 1] = 1;
      scratch[at + 2] = step.vk | 0;
      scratch[at + 3] = step.scan | 0;
      scratch[at + 4] = step.extended ? 1 : 0;
    });
    if (!live || !playable(macro, index) || macro.bindKind !== "key") continue;
    const vk = macro.bindVk;
    if (vk <= 0 || vk >= 256 || scratch[MAP_AT + vk] !== 0) continue;
    scratch[MAP_AT + vk] = index + 1;
  }
  Atomics.add(view, 0, 1);
  for (let index = 1; index < scratch.length; index += 1) {
    Atomics.store(view, index, scratch[index]);
  }
  Atomics.add(view, 0, 1);
}

/** -1 is the power key, -2 means the table was being written, otherwise index + 1. */
export function readBind(view: Int32Array, vk: number): number {
  if (vk <= 0 || vk >= 256) return 0;
  const seq = Atomics.load(view, 0);
  if ((seq & 1) !== 0) return -2;
  const power = Atomics.load(view, 2);
  const mapAt = Atomics.load(view, 4);
  if (mapAt < 8) {
    if (Atomics.load(view, 0) !== seq) return -2;
    return power === vk ? -1 : 0;
  }
  const live = Atomics.load(view, 1);
  const slot = Atomics.load(view, mapAt + vk);
  if (Atomics.load(view, 0) !== seq) return -2;
  if (power === vk) return -1;
  if (live !== 1) return 0;
  return slot;
}

/** Copies one macro out of the table. Empty when the index is stale. */
export function readSteps(view: Int32Array, index: number): PlayStep[] {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const seq = Atomics.load(view, 0);
    if ((seq & 1) !== 0) continue;
    const total = Atomics.load(view, 3);
    const macroAt = Atomics.load(view, 5);
    const stride = Atomics.load(view, 6);
    if (index < 0 || index >= total || stride < 7 || macroAt < 8) {
      if (Atomics.load(view, 0) !== seq) continue;
      return [];
    }
    const base = macroAt + index * stride;
    const count = Atomics.load(view, base);
    const steps: PlayStep[] = [];
    const limit = count > 80 ? 80 : count;
    for (let step = 0; step < limit; step += 1) {
      const at = base + 1 + step * 6;
      steps.push({
        kind: Atomics.load(view, at),
        device: Atomics.load(view, at + 1),
        vk: Atomics.load(view, at + 2),
        scan: Atomics.load(view, at + 3),
        extended: Atomics.load(view, at + 4),
        extra: Atomics.load(view, at + 5),
      });
    }
    if (Atomics.load(view, 0) === seq) return steps;
  }
  return [];
}

/** Claims the single playback slot and wakes the player thread. */
export function claimPlay(play: Int32Array, index: number): boolean {
  if (Atomics.compareExchange(play, 2, 0, 1) !== 0) return false;
  Atomics.store(play, 1, index);
  Atomics.store(play, 0, 1);
  Atomics.notify(play, 0, 1);
  return true;
}
