import { useEffect, useRef, useState } from "react";
import type { PerfDisplay, PerfPlacement, PerfSample, Settings } from "@shared/contracts";
import {
  clampPerf,
  cornerPerf,
  perfScaleOf,
  perfSize,
  unionPerf,
  type PerfBox,
  type PerfCorner,
} from "@shared/perf";
import { WindowControls } from "./WindowChrome";

const CORNERS: { id: PerfCorner; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
];

type Drag = { grabX: number; grabY: number };

function cornerPoint(display: PerfDisplay, corner: PerfCorner): { x: number; y: number } {
  const inset = 20;
  const right = corner === "top-right" || corner === "bottom-right";
  const bottom = corner === "bottom-left" || corner === "bottom-right";
  return {
    x: right ? display.x + display.width - inset : display.x + inset,
    y: bottom ? display.y + display.height - inset : display.y + inset,
  };
}

function screenAt(
  event: { clientX: number; clientY: number },
  stage: HTMLElement,
  box: PerfBox,
): { x: number; y: number } {
  const rect = stage.getBoundingClientRect();
  return {
    x: box.x + ((event.clientX - rect.left) / (rect.width || 1)) * box.width,
    y: box.y + ((event.clientY - rect.top) / (rect.height || 1)) * box.height,
  };
}

function readNumber(sample: PerfSample | null, key: keyof PerfSample, suffix: string): string {
  const value = sample?.[key];
  return value === null || value === undefined ? "—" : `${value}${suffix}`;
}

/** Placement window. The live readout ignores the mouse. */
export function PerfSetup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [displays, setDisplays] = useState<PerfDisplay[]>([]);
  const [frame, setFrame] = useState<PerfPlacement | null>(null);
  const [sample, setSample] = useState<PerfSample | null>(null);
  const frameRef = useRef<PerfPlacement | null>(null);
  const areasRef = useRef<PerfBox[]>([]);
  const dragRef = useRef<Drag | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);
  const persistTimer = useRef<number | null>(null);

  const union = unionPerf(displays.map((display) => ({
    x: display.x,
    y: display.y,
    width: display.width,
    height: display.height,
  })));
  areasRef.current = union ? displays.map((display) => ({
    x: display.x,
    y: display.y,
    width: display.width,
    height: display.height,
  })) : [];

  function remember(next: PerfPlacement): void {
    frameRef.current = next;
    setFrame(next);
    if (settings?.perfEnabled) window.lumen.previewPerf(next);
  }

  function persist(): void {
    const next = frameRef.current;
    if (!next || !readyRef.current) return;
    void window.lumen.setSettings({
      perfBounds: { x: Math.round(next.x), y: Math.round(next.y) },
      perfScale: next.scale,
      perfOpacity: next.opacity,
    }).then((saved) => {
      if (!dragRef.current) setSettings(saved);
    });
  }

  function persistSoon(): void {
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null;
      persist();
    }, 120);
  }

  function placeCorner(display: PerfDisplay, corner: PerfCorner): void {
    const current = frameRef.current;
    if (!current) return;
    const origin = cornerPerf(
      { x: display.x, y: display.y, width: display.width, height: display.height },
      perfSize(current.scale),
      corner,
    );
    remember({ ...current, x: origin.x, y: origin.y });
    persist();
  }

  function nudge(dx: number, dy: number): void {
    const current = frameRef.current;
    if (!current) return;
    const size = perfSize(current.scale);
    const moved = clampPerf(current.x + dx, current.y + dy, size, areasRef.current);
    remember({ ...current, x: moved.x, y: moved.y });
    persistSoon();
  }

  useEffect(() => {
    let stop = false;
    void Promise.all([
      window.lumen.getSettings(),
      window.lumen.perfDisplays(),
      window.lumen.perfFrame(),
    ]).then(([nextSettings, nextDisplays, nextFrame]) => {
      if (stop) return;
      const placement: PerfPlacement = {
        x: nextSettings.perfBounds?.x ?? nextFrame.x,
        y: nextSettings.perfBounds?.y ?? nextFrame.y,
        scale: nextSettings.perfScale,
        opacity: nextSettings.perfOpacity,
      };
      frameRef.current = placement;
      readyRef.current = true;
      setSettings(nextSettings);
      setDisplays(nextDisplays);
      setFrame(placement);
    }).catch((error: unknown) => {
      console.error("performance settings", error);
    });
    const stopTheme = window.lumen.onTheme((next) => {
      setSettings(next);
      if (dragRef.current || !readyRef.current) return;
      const current = frameRef.current;
      if (!current || !next.perfBounds) return;
      const placement = {
        x: next.perfBounds.x,
        y: next.perfBounds.y,
        scale: next.perfScale,
        opacity: next.perfOpacity,
      };
      frameRef.current = placement;
      setFrame(placement);
    });
    const stopSample = window.lumen.onPerfSample(setSample);
    return () => {
      stop = true;
      stopTheme();
      stopSample();
      if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
    };
  }, []);

  const nudgeRef = useRef<(dx: number, dy: number) => void>(() => {});
  nudgeRef.current = nudge;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const step = event.shiftKey ? 32 : 8;
      const move: Record<string, [number, number] | undefined> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = move[event.key];
      if (!delta) return;
      event.preventDefault();
      nudgeRef.current(delta[0], delta[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const enabled = settings?.perfEnabled === true;
  const size = perfSize(frame?.scale ?? 1);
  const live = enabled ? sample : null;

  return (
    <div className="perf-app">
      <header className="macro-bar">
        <span className="hub-kicker">Performance</span>
        <strong>Overlay</strong>
        <button
          type="button"
          className={enabled ? "plugin-toggle is-on" : "plugin-toggle"}
          onClick={() => {
            const current = frameRef.current;
            void window.lumen.setSettings({
              perfEnabled: !enabled,
              perfBounds: current
                ? { x: Math.round(current.x), y: Math.round(current.y) }
                : settings?.perfBounds ?? null,
              perfScale: current?.scale ?? settings?.perfScale,
              perfOpacity: current?.opacity ?? settings?.perfOpacity,
            }).then(setSettings);
          }}
        >
          <i />
          {enabled ? "On" : "Off"}
        </button>
        <WindowControls
          onMinimize={() => { void window.lumen.perfWindow("minimize"); }}
          onMaximize={() => { void window.lumen.perfWindow("maximize"); }}
          onClose={() => { void window.lumen.perfWindow("close"); }}
        />
      </header>
      <div className="perf-body">
        <section className="perf-place">
          <div
            ref={stageRef}
            className="perf-stage"
            style={union ? { aspectRatio: `${union.width} / ${union.height}` } : undefined}
            onPointerDown={(event) => {
              if (event.button !== 0 || !union || !frameRef.current) return;
              const stage = event.currentTarget;
              stage.setPointerCapture(event.pointerId);
              const cardSize = perfSize(frameRef.current.scale);
              dragRef.current = { grabX: cardSize.width / 2, grabY: cardSize.height / 2 };
              const pointer = screenAt(event, stage, union);
              const moved = clampPerf(
                pointer.x - cardSize.width / 2,
                pointer.y - cardSize.height / 2,
                cardSize,
                areasRef.current,
              );
              remember({
                ...frameRef.current,
                x: moved.x,
                y: moved.y,
              });
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              const stage = stageRef.current;
              const current = frameRef.current;
              if (!drag || !union || !stage || !current) return;
              const pointer = screenAt(event, stage, union);
              const cardSize = perfSize(current.scale);
              const moved = clampPerf(
                pointer.x - drag.grabX,
                pointer.y - drag.grabY,
                cardSize,
                areasRef.current,
              );
              remember({ ...current, x: moved.x, y: moved.y });
            }}
            onPointerUp={() => {
              if (!dragRef.current) return;
              dragRef.current = null;
              persist();
            }}
            onLostPointerCapture={() => {
              if (!dragRef.current) return;
              dragRef.current = null;
              persist();
            }}
          >
            {union ? displays.map((display, index) => (
              <div
                key={display.id}
                className="perf-monitor"
                style={{
                  left: `${((display.x - union.x) / union.width) * 100}%`,
                  top: `${((display.y - union.y) / union.height) * 100}%`,
                  width: `${(display.width / union.width) * 100}%`,
                  height: `${(display.height / union.height) * 100}%`,
                }}
              >
                <span>{display.primary ? "Primary" : `Screen ${index + 1}`}</span>
                {CORNERS.map((corner) => {
                  const point = cornerPoint(display, corner.id);
                  const spot = cornerPerf(
                    {
                      x: display.x,
                      y: display.y,
                      width: display.width,
                      height: display.height,
                    },
                    size,
                    corner.id,
                  );
                  const chosen = frame
                    && Math.abs(frame.x - spot.x) < 2
                    && Math.abs(frame.y - spot.y) < 2;
                  return (
                    <button
                      key={corner.id}
                      type="button"
                      className={chosen ? "perf-dot is-on" : "perf-dot"}
                      aria-label={corner.label}
                      style={{
                        left: `${((point.x - display.x) / display.width) * 100}%`,
                        top: `${((point.y - display.y) / display.height) * 100}%`,
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        placeCorner(display, corner.id);
                      }}
                    />
                  );
                })}
              </div>
            )) : null}
            {union && frame ? (
              <i
                className="perf-mark"
                style={{
                  left: `${((frame.x + size.width / 2 - union.x) / union.width) * 100}%`,
                  top: `${((frame.y + size.height / 2 - union.y) / union.height) * 100}%`,
                }}
              />
            ) : null}
          </div>
          <p className="hub-note">
            Drag on the screen to move the line. The buttons beside it change its size.
          </p>
        </section>
        <section className="perf-controls">
          <div className="perf-resize">
            <button
              type="button"
              aria-label="Smaller"
              disabled={(frame?.scale ?? 1) <= 0.8}
              onClick={() => {
                const current = frameRef.current;
                if (!current) return;
                const scale = perfScaleOf(current.scale - 0.1);
                const nextSize = perfSize(scale);
                const moved = clampPerf(current.x, current.y, nextSize, areasRef.current);
                remember({ ...current, x: moved.x, y: moved.y, scale });
                persist();
              }}
            >
              −
            </button>
            <div className="perf-sample-slot" style={{ height: size.height }}>
              <div
                className="perf-sample"
                style={{
                  opacity: frame?.opacity ?? 0.92,
                  transform: `scale(${frame?.scale ?? 1})`,
                  transformOrigin: "left center",
                }}
                aria-live="polite"
              >
                <strong>{readNumber(live, "fps", "")}</strong>
                <span>fps</span>
                <em><b>{readNumber(live, "cpu", "")}</b>cpu</em>
                <em><b>{readNumber(live, "gpu", "")}</b>gpu</em>
                <em><b>{readNumber(live, "ram", "")}</b>ram</em>
              </div>
            </div>
            <button
              type="button"
              aria-label="Bigger"
              disabled={(frame?.scale ?? 1) >= 1}
              onClick={() => {
                const current = frameRef.current;
                if (!current) return;
                const scale = perfScaleOf(current.scale + 0.1);
                const nextSize = perfSize(scale);
                const moved = clampPerf(current.x, current.y, nextSize, areasRef.current);
                remember({ ...current, x: moved.x, y: moved.y, scale });
                persist();
              }}
            >
              +
            </button>
          </div>
          <label className="perf-slider">
            <span>Fade</span>
            <input
              type="range"
              min={35}
              max={100}
              step={1}
              value={Math.round((frame?.opacity ?? 0.92) * 100)}
              onInput={(event) => {
                const current = frameRef.current;
                if (!current) return;
                remember({ ...current, opacity: Number(event.currentTarget.value) / 100 });
                persistSoon();
              }}
              onPointerUp={() => persist()}
              onKeyUp={() => persist()}
            />
            <em>{Math.round((frame?.opacity ?? 0.92) * 100)}%</em>
          </label>
          <p className="hub-note">
            Colors follow the theme. The line stays out of the mouse.
          </p>
        </section>
      </div>
    </div>
  );
}
