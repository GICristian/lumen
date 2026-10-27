import { useEffect, useState } from "react";
import type { PerfLook, PerfSample, Settings } from "@shared/contracts";

function read(value: number | null): string {
  return value === null ? "—" : String(value);
}

function Usage({ label, value }: { label: string; value: number | null }) {
  return (
    <em>
      <b>{read(value)}</b>
      {label}
    </em>
  );
}

function applyLook(root: HTMLElement, look: PerfLook): void {
  root.style.setProperty("--perf-scale", String(look.scale));
  root.style.setProperty("--perf-opacity", String(look.opacity));
}

/** Click-through line. Placement lives in the performance window. */
export function PerfOverlay() {
  const [sample, setSample] = useState<PerfSample | null>(null);
  const [look, setLook] = useState<PerfLook>({ scale: 1, opacity: 0.92 });

  useEffect(() => window.lumen.onPerfSample(setSample), []);

  useEffect(() => {
    const fromSettings = (settings: Settings): void => {
      setLook({ scale: settings.perfScale, opacity: settings.perfOpacity });
    };
    void window.lumen.getSettings().then(fromSettings);
    const stopTheme = window.lumen.onTheme(fromSettings);
    const stopLook = window.lumen.onPerfLook(setLook);
    return () => {
      stopTheme();
      stopLook();
    };
  }, []);

  useEffect(() => {
    applyLook(document.documentElement, look);
  }, [look]);

  return (
    <div className="perf-hud" role="status" aria-label="Performance">
      <strong>{read(sample?.fps ?? null)}</strong>
      <span>fps</span>
      <Usage label="cpu" value={sample?.cpu ?? null} />
      <Usage label="gpu" value={sample?.gpu ?? null} />
      <Usage label="ram" value={sample?.ram ?? null} />
    </div>
  );
}
