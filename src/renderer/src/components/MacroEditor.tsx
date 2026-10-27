import { useEffect, useRef, useState } from "react";
import type { Settings } from "@shared/contracts";
import { KEY_MOUSE, KEY_ROWS, KEY_SIDE, type KeyCap } from "@shared/keyDeck";
import {
  bindConflicts,
  describeMacro,
  emptyMacro,
  keyExtended,
  type MacroBind,
  type MacroStep,
} from "@shared/macros";
import { WindowControls } from "./WindowChrome";

type Mode = "trigger" | "down" | "up" | "replace" | "power";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "trigger", label: "Trigger", hint: "Click a key. That key plays this macro." },
  { id: "down", label: "Press", hint: "Click a key to insert a press after the selected step." },
  { id: "up", label: "Release", hint: "Click a key to insert a release after the selected step." },
  { id: "replace", label: "Replace", hint: "Click a key to change the selected step." },
];

function Arrow({ dir }: { dir: "up" | "down" }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      {dir === "up" ? <path d="M6 2.2 2.2 7.2h7.6z" /> : <path d="M6 9.8 9.8 4.8H2.2z" />}
    </svg>
  );
}

function stepFrom(cap: KeyCap, kind: "down" | "up"): MacroStep {
  if (cap.mouse) {
    return {
      kind,
      device: "mouse",
      vk: 0,
      scan: 0,
      extended: false,
      mouse: cap.mouse,
      name: cap.label,
      milliseconds: 0,
    };
  }
  return {
    kind,
    device: "key",
    vk: cap.vk,
    scan: 0,
    extended: keyExtended(cap.vk),
    mouse: "",
    name: cap.label,
    milliseconds: 0,
  };
}

function stepLabel(step: MacroStep): string {
  if (step.kind === "wait") return `Wait   ${step.milliseconds} ms`;
  const name = step.name || step.mouse || "Key";
  return `${name}   ${step.kind === "down" ? "down" : "up"}`;
}

function isTrigger(cap: KeyCap, macro: MacroBind | undefined): boolean {
  if (!macro || (!cap.vk && !cap.mouse)) return false;
  if (cap.mouse) return macro.bindKind === "mouse" && macro.bindMouse === cap.mouse;
  return macro.bindKind === "key" && macro.bindVk === cap.vk;
}

function isPower(cap: KeyCap, settings: Settings | null): boolean {
  if (!settings || settings.macroPowerKind === "none") return false;
  if (cap.mouse) return settings.macroPowerKind === "mouse" && settings.macroPowerMouse === cap.mouse;
  return settings.macroPowerKind === "key" && cap.vk > 0 && settings.macroPowerVk === cap.vk;
}

function withMacro(list: MacroBind[], index: number, next: MacroBind): MacroBind[] {
  return list.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function blockedName(macro: MacroBind, settings: Settings | null): string | null {
  if (!settings) return null;
  const names: [string, string][] = [
    [settings.replayAccelerator, "Replay"],
    [settings.screenshotAccelerator, "Screenshot"],
    [settings.overlayAccelerator, "Overlay"],
    [settings.vaultAccelerator, "Vault"],
    [settings.soundboardAccelerator, "Soundboard"],
  ];
  const hit = names.find(([accelerator]) => bindConflicts(macro, accelerator));
  return hit ? hit[1] : null;
}

function capClass(cap: KeyCap, macro: MacroBind | undefined, settings: Settings | null): string {
  if (!cap.vk && !cap.mouse) return "key-cap is-gap";
  const names = ["key-cap"];
  if (isTrigger(cap, macro)) names.push("is-bind");
  if (isPower(cap, settings)) names.push("is-power");
  return names.join(" ");
}

function KeyRows({
  rows,
  macro,
  settings,
  onPick,
}: {
  rows: KeyCap[][];
  macro: MacroBind | undefined;
  settings: Settings | null;
  onPick: (cap: KeyCap) => void;
}) {
  return (
    <div className="key-rows">
      {rows.map((row, rowIndex) => (
        <div className="key-row" key={rowIndex}>
          {row.map((cap, capIndex) => {
            const real = cap.vk > 0 || cap.mouse !== "";
            return (
              <button
                key={`${rowIndex}-${capIndex}`}
                type="button"
                className={capClass(cap, macro, settings)}
                style={{ flexGrow: cap.grow }}
                disabled={!real}
                onClick={() => onPick(cap)}
              >
                {cap.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function MacroEditor() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [macros, setMacros] = useState<MacroBind[]>([]);
  const [index, setIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("trigger");
  const [wait, setWait] = useState("6.94");
  const [timing, setTiming] = useState("");
  const [status, setStatus] = useState("");
  const macrosRef = useRef<MacroBind[]>([]);
  const saveSeq = useRef(0);

  useEffect(() => {
    void window.lumen.macroDocument().then((list) => {
      macrosRef.current = list;
      setMacros(list);
    });
    void window.lumen.getSettings().then(setSettings);
    return window.lumen.onTheme(setSettings);
  }, []);

  const current = macros[index];
  const modeHint = MODES.find((item) => item.id === mode)?.hint ?? "";
  const blocked = current ? blockedName(current, settings) : null;

  useEffect(() => {
    const selected = current?.steps[stepIndex];
    if (selected?.kind === "wait") setTiming(String(selected.milliseconds));
  }, [current, stepIndex]);

  function remember(next: MacroBind[]): void {
    macrosRef.current = next;
    setMacros(next);
  }

  async function commit(next: MacroBind[]): Promise<boolean> {
    remember(next);
    const seq = saveSeq.current + 1;
    saveSeq.current = seq;
    try {
      const saved = await window.lumen.saveMacros(next);
      if (seq !== saveSeq.current) return true;
      remember(saved);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the macro.");
      return false;
    }
  }

  function withTypedWait(list: MacroBind[]): MacroBind[] | null {
    const macro = list[index];
    const selected = macro?.steps[stepIndex];
    if (!macro || !selected || selected.kind !== "wait") return list;
    const milliseconds = Number(timing);
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
    if (Math.abs(selected.milliseconds - milliseconds) < 0.0001) return list;
    const steps = macro.steps.map((item, itemIndex) => (
      itemIndex === stepIndex ? { ...item, milliseconds } : item
    ));
    return withMacro(list, index, { ...macro, steps });
  }

  async function save(): Promise<void> {
    const next = withTypedWait(macrosRef.current);
    if (!next) {
      setStatus("Write the wait in milliseconds. Example: 6.94");
      return;
    }
    const ok = await commit(next);
    if (ok) setStatus("Saved.");
  }

  async function assignPower(cap: KeyCap): Promise<void> {
    if (!settings) return;
    const same = cap.mouse
      ? settings.macroPowerKind === "mouse" && settings.macroPowerMouse === cap.mouse
      : settings.macroPowerKind === "key" && settings.macroPowerVk === cap.vk;
    const next = same
      ? { macroPowerKind: "none" as const, macroPowerVk: 0, macroPowerMouse: "", macroPowerName: "" }
      : cap.mouse
        ? {
          macroPowerKind: "mouse" as const,
          macroPowerVk: 0,
          macroPowerMouse: cap.mouse,
          macroPowerName: cap.label,
        }
        : {
          macroPowerKind: "key" as const,
          macroPowerVk: cap.vk,
          macroPowerMouse: "",
          macroPowerName: cap.label,
        };
    setSettings(await window.lumen.setSettings(next));
    setMode("trigger");
    setStatus(same ? "Switch cleared." : `${cap.label} turns the macro on and off. It does not play it.`);
  }

  function pick(cap: KeyCap): void {
    const list = macrosRef.current;
    const macro = list[index];
    if (!cap.vk && !cap.mouse) return;
    if (mode === "power") {
      void assignPower(cap);
      return;
    }
    if (!macro) return;
    if (mode === "trigger") {
      const next: MacroBind = cap.mouse
        ? {
          ...macro,
          bindKind: "mouse",
          bindMouse: cap.mouse,
          bindName: cap.label,
          bindVk: 0,
          bindScan: 0,
          bindExtended: false,
        }
        : {
          ...macro,
          bindKind: "key",
          bindVk: cap.vk,
          bindScan: 0,
          bindExtended: keyExtended(cap.vk),
          bindMouse: "",
          bindName: cap.label,
        };
      void commit(withMacro(list, index, next));
      setStatus(`${cap.label} plays this macro.`);
      return;
    }
    if (mode === "replace") {
      const selected = macro.steps[stepIndex];
      if (!selected || selected.kind === "wait") {
        setStatus("Select a press or release, then click the new key.");
        return;
      }
      const kind = selected.kind === "up" ? "up" : "down";
      const steps = macro.steps.map((item, itemIndex) => (
        itemIndex === stepIndex ? stepFrom(cap, kind) : item
      ));
      void commit(withMacro(list, index, { ...macro, steps }));
      setMode("trigger");
      setStatus(`Step ${stepIndex + 1} is now ${cap.label}.`);
      return;
    }
    const at = stepIndex < 0 || stepIndex >= macro.steps.length
      ? macro.steps.length
      : stepIndex + 1;
    const steps = macro.steps.slice();
    steps.splice(at, 0, stepFrom(cap, mode === "up" ? "up" : "down"));
    void commit(withMacro(list, index, { ...macro, steps }));
    setStepIndex(at);
    setMode("trigger");
    setStatus(`${cap.label} ${mode === "up" ? "release" : "press"} added.`);
  }

  function insertWait(): void {
    const list = macrosRef.current;
    const macro = list[index];
    if (!macro) return;
    const milliseconds = Number(wait);
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      setStatus("Write the wait in milliseconds. Example: 6.94");
      return;
    }
    const at = stepIndex < 0 || stepIndex >= macro.steps.length
      ? macro.steps.length
      : stepIndex + 1;
    const steps = macro.steps.slice();
    steps.splice(at, 0, {
      kind: "wait",
      device: "time",
      vk: 0,
      scan: 0,
      extended: false,
      mouse: "",
      name: "",
      milliseconds,
    });
    void commit(withMacro(list, index, { ...macro, steps }));
    setStepIndex(at);
    setStatus(`Wait of ${milliseconds} ms added.`);
  }

  function updateWait(): void {
    const list = macrosRef.current;
    const macro = list[index];
    if (!macro) return;
    const selected = macro.steps[stepIndex];
    const milliseconds = Number(timing);
    if (!selected || selected.kind !== "wait") return;
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    if (Math.abs(selected.milliseconds - milliseconds) < 0.0001) return;
    const steps = macro.steps.map((item, itemIndex) => (
      itemIndex === stepIndex ? { ...item, milliseconds } : item
    ));
    void commit(withMacro(list, index, { ...macro, steps }));
    setStatus(`Wait is ${milliseconds} ms.`);
  }

  function flipStep(at: number): void {
    const list = macrosRef.current;
    const macro = list[index];
    const selected = macro?.steps[at];
    if (!macro || !selected || selected.kind === "wait") return;
    const kind: "down" | "up" = selected.kind === "down" ? "up" : "down";
    const steps = macro.steps.map((item, itemIndex) => (
      itemIndex === at ? { ...item, kind } : item
    ));
    setStepIndex(at);
    void commit(withMacro(list, index, { ...macro, steps }));
  }

  function removeStep(): void {
    const list = macrosRef.current;
    const macro = list[index];
    if (!macro || stepIndex < 0 || stepIndex >= macro.steps.length) {
      setStatus("Select the step you want to remove.");
      return;
    }
    const steps = macro.steps.filter((_, itemIndex) => itemIndex !== stepIndex);
    void commit(withMacro(list, index, { ...macro, steps }));
    setStepIndex(Math.min(stepIndex, Math.max(0, steps.length - 1)));
    setStatus("Step removed.");
  }

  function moveStep(at: number, delta: number): void {
    const list = macrosRef.current;
    const macro = list[index];
    if (!macro) return;
    const next = at + delta;
    if (at < 0 || next < 0 || next >= macro.steps.length) return;
    const steps = macro.steps.slice();
    const [step] = steps.splice(at, 1);
    if (!step) return;
    steps.splice(next, 0, step);
    void commit(withMacro(list, index, { ...macro, steps }));
    setStepIndex(next);
  }

  async function toggleLive(): Promise<void> {
    if (!settings) return;
    if (!settings.macroEnabled) {
      setSettings(await window.lumen.setMacroEnabled(true));
      setStatus("Macros are live.");
      return;
    }
    const next = await window.lumen.setMacroLive(!settings.macroLive);
    setSettings(next);
    setStatus(next.macroLive ? "Macros are live." : "Macros are paused.");
  }

  return (
    <div className="macro-app">
      <header className="macro-bar">
        <span className="hub-kicker">Macro</span>
        <strong>Keyboard</strong>
        <button type="button" className="macro-save" onClick={() => { void save(); }}>
          Save
        </button>
        <button
          type="button"
          className={settings?.macroLive ? "macro-live is-on" : "macro-live"}
          onClick={() => { void toggleLive(); }}
        >
          <i />
          {settings?.macroLive ? "Live" : "Paused"}
        </button>
        <WindowControls
          onMinimize={() => { void window.lumen.macroWindow("minimize"); }}
          onMaximize={() => { void window.lumen.macroWindow("maximize"); }}
          onClose={() => { void window.lumen.macroWindow("close"); }}
        />
      </header>
      <div className="macro-body">
        <aside className="macro-list">
          <div className="macro-list-tools">
            <button
              type="button"
              onClick={() => {
                const list = macrosRef.current;
                const next = [...list, { ...emptyMacro(), name: `Macro ${list.length + 1}` }];
                setIndex(next.length - 1);
                setStepIndex(0);
                void commit(next);
              }}
            >
              New
            </button>
            <button
              type="button"
              onClick={() => {
                const list = macrosRef.current;
                if (list.length <= 1) {
                  setStatus("Keep at least one macro.");
                  return;
                }
                const next = list.filter((_, itemIndex) => itemIndex !== index);
                setIndex(Math.min(index, next.length - 1));
                void commit(next);
              }}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => {
                void window.lumen.importMacros().then((saved) => {
                  if (!saved) return;
                  macrosRef.current = saved;
                  setMacros(saved);
                  setIndex(0);
                  setStepIndex(0);
                  setStatus("Macros imported.");
                }).catch((error: unknown) => {
                  setStatus(error instanceof Error ? error.message : "Could not import.");
                });
              }}
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => {
                void window.lumen.exportMacros().then((saved) => {
                  if (saved) setStatus("Macros exported.");
                }).catch((error: unknown) => {
                  setStatus(error instanceof Error ? error.message : "Could not export.");
                });
              }}
            >
              Export
            </button>
          </div>
          <div className="macro-names">
            {macros.map((macro, itemIndex) => (
              <button
                key={`${macro.name}-${itemIndex}`}
                type="button"
                className={itemIndex === index ? "is-on" : ""}
                onClick={() => {
                  setIndex(itemIndex);
                  setStepIndex(0);
                }}
              >
                <strong>{macro.name}</strong>
                <small>{macro.enabled ? macro.bindName || "Unbound" : "Off"}</small>
              </button>
            ))}
          </div>
          {current ? (
            <label className="macro-name">
              Name
              <input
                value={current.name}
                maxLength={48}
                onChange={(event) => {
                  const list = macrosRef.current;
                  const macro = list[index];
                  if (!macro) return;
                  remember(withMacro(list, index, { ...macro, name: event.target.value }));
                }}
                onBlur={(event) => {
                  const list = macrosRef.current;
                  const macro = list[index];
                  if (!macro) return;
                  void commit(withMacro(list, index, { ...macro, name: event.target.value }));
                }}
              />
            </label>
          ) : null}
          {current ? (
            <button
              type="button"
              className={current.enabled ? "macro-live is-on" : "macro-live"}
              onClick={() => {
                const list = macrosRef.current;
                const macro = list[index];
                if (!macro) return;
                void commit(withMacro(list, index, { ...macro, enabled: !macro.enabled }));
              }}
            >
              <i />
              {current.enabled ? "Working" : "Off"}
            </button>
          ) : null}
          <section className="macro-switch">
            <span>Switch</span>
            <strong>{settings?.macroPowerName || "None"}</strong>
            <p>Turns the macro on or off. This is not the key that plays it.</p>
            <div>
              <button
                type="button"
                className={mode === "power" ? "is-on" : ""}
                onClick={() => setMode(mode === "power" ? "trigger" : "power")}
              >
                {mode === "power" ? "Click a key" : "Choose"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void window.lumen.setSettings({
                    macroPowerKind: "none",
                    macroPowerVk: 0,
                    macroPowerMouse: "",
                    macroPowerName: "",
                  }).then(setSettings);
                  setStatus("Switch cleared.");
                }}
              >
                Clear
              </button>
            </div>
          </section>
        </aside>
        <section className="macro-stage">
          <div className="macro-modes">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={mode === item.id ? "is-on" : ""}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="macro-hint">
            {mode === "power"
              ? "Click the key or mouse button that turns the macro on and off."
              : modeHint}
          </p>
          <div className="key-deck">
            <KeyRows rows={KEY_ROWS} macro={current} settings={settings} onPick={pick} />
            <KeyRows rows={KEY_SIDE} macro={current} settings={settings} onPick={pick} />
          </div>
          <div className="key-mouse">
            <KeyRows rows={[KEY_MOUSE]} macro={current} settings={settings} onPick={pick} />
          </div>
          <p className="macro-summary">
            {blocked ? `This trigger matches ${blocked}, so it stays disarmed. ` : ""}
            {current ? describeMacro(current) || "No steps yet." : ""}
          </p>
          {status ? <p className="macro-status">{status}</p> : null}
        </section>
        <aside className="macro-steps">
          <h2>Steps</h2>
          <ol>
            {current?.steps.map((step, itemIndex) => (
              <li key={`${step.kind}-${step.vk}-${itemIndex}`} className="macro-step-row">
                <button
                  type="button"
                  className={itemIndex === stepIndex ? "macro-step is-on" : "macro-step"}
                  onClick={() => setStepIndex(itemIndex)}
                >
                  <span>{String(itemIndex + 1).padStart(2, "0")}</span>
                  {step.kind === "wait" && itemIndex === stepIndex ? "Wait" : stepLabel(step)}
                </button>
                {step.kind === "wait" && itemIndex === stepIndex ? (
                  <input
                    className="macro-step-ms"
                    value={timing}
                    inputMode="decimal"
                    aria-label="Wait milliseconds"
                    onChange={(event) => setTiming(event.target.value)}
                    onBlur={updateWait}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void save();
                    }}
                  />
                ) : null}
                {step.kind !== "wait" ? (
                  <button type="button" className="macro-kind" onClick={() => flipStep(itemIndex)}>
                    {step.kind === "down" ? "down" : "up"}
                  </button>
                ) : null}
                <span className="macro-arrows">
                  <button
                    type="button"
                    className="macro-arrow"
                    aria-label="Move up"
                    disabled={itemIndex === 0}
                    onClick={() => moveStep(itemIndex, -1)}
                  >
                    <Arrow dir="up" />
                  </button>
                  <button
                    type="button"
                    className="macro-arrow"
                    aria-label="Move down"
                    disabled={!current || itemIndex === current.steps.length - 1}
                    onClick={() => moveStep(itemIndex, 1)}
                  >
                    <Arrow dir="down" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <label className="macro-name">
            New wait, ms
            <input
              value={wait}
              inputMode="decimal"
              onChange={(event) => setWait(event.target.value)}
            />
          </label>
          <div className="macro-list-tools">
            <button type="button" onClick={insertWait}>Add wait</button>
            <button type="button" onClick={removeStep}>Remove</button>
          </div>
          <button type="button" className="macro-save-step" onClick={() => { void save(); }}>
            Save
          </button>
        </aside>
      </div>
    </div>
  );
}
