import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type Tool = "select" | "pen" | "box";
type Stroke = { kind: "pen" | "box"; color: string; points: Point[] };

const COLORS = ["#ffffff", "#ff4b4b", "#f2c779", "#1c1915"];

function normalize(ax: number, ay: number, bx: number, by: number): Box {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  };
}

function pathOf(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}

export function ScreenshotSelect() {
  const imageRef = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState("");
  const [box, setBox] = useState<Box | null>(null);
  const [note, setNote] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[2]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const draftRef = useRef<Stroke | null>(null);
  const drag = useRef<{ x: number; y: number; box: Box | null; move: boolean } | null>(null);
  const state = useRef({ box, strokes, color, tool });
  state.current = { box, strokes, color, tool };

  useEffect(() => {
    let gone = false;
    void window.lumen.screenshotFrame().then((frame) => {
      if (!gone && frame) setUrl(frame);
    }).catch(() => setNote("The screen could not be captured."));
    const stop = window.lumen.onScreenshotReady((frame) => setUrl(frame));
    const command = window.lumen.onScreenshotCommand((kind) => {
      const current = state.current;
      if (kind === "undo") {
        setStrokes((items) => items.slice(0, -1));
        return;
      }
      void finish(kind === "copy", current.box, current.strokes);
    });
    const reset = window.lumen.onScreenshotReset(() => {
      setUrl("");
      setBox(null);
      setStrokes([]);
      setDraft(null);
      draftRef.current = null;
      setNote("");
      setTool("select");
    });
    return () => {
      gone = true;
      stop();
      reset();
      command();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const current = state.current;
      if (event.key === "Escape") {
        window.lumen.closeScreenshot();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setStrokes((items) => items.slice(0, -1));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void finish(true, current.box, current.strokes);
        return;
      }
      const save = event.key === "Enter"
        || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s");
      if (save) {
        event.preventDefault();
        void finish(false, current.box, current.strokes);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function point(event: { clientX: number; clientY: number }): Point {
    return { x: event.clientX, y: event.clientY };
  }

  async function finish(copy: boolean, region: Box | null, marks: Stroke[]): Promise<void> {
    const image = imageRef.current;
    if (!image || !region || region.w < 8 || region.h < 8) return;
    if (!image.naturalWidth || !image.clientWidth) return;
    const scaleX = image.naturalWidth / image.clientWidth;
    const scaleY = image.naturalHeight / image.clientHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(region.w * scaleX));
    canvas.height = Math.max(1, Math.round(region.h * scaleY));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(
      image,
      region.x * scaleX,
      region.y * scaleY,
      region.w * scaleX,
      region.h * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of marks) {
      context.strokeStyle = stroke.color;
      context.lineWidth = 3 * scaleX;
      context.beginPath();
      if (stroke.kind === "box" && stroke.points.length > 1) {
        const start = stroke.points[0];
        const end = stroke.points[stroke.points.length - 1];
        context.strokeRect(
          start.x * scaleX,
          start.y * scaleY,
          (end.x - start.x) * scaleX,
          (end.y - start.y) * scaleY,
        );
        continue;
      }
      stroke.points.forEach((spot, index) => {
        const x = spot.x * scaleX;
        const y = spot.y * scaleY;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    window.lumen.closeScreenshot();
    if (copy) void window.lumen.copyScreenshot(bytes);
    else void window.lumen.saveScreenshot(bytes);
  }

  function local(event: { clientX: number; clientY: number }, region: Box): Point {
    return { x: event.clientX - region.x, y: event.clientY - region.y };
  }

  const ready = box && box.w > 8 && box.h > 8;
  const toolsTop = box
    ? (box.y + box.h + 84 < window.innerHeight ? box.y + box.h + 8 : Math.max(8, box.y - 78))
    : 0;
  const drawn = draft ? [...strokes, draft] : strokes;

  return (
    <main
      className="shot-stage"
      onPointerDown={(event) => {
        if (state.current.tool !== "select") return;
        const at = point(event);
        const inside = Boolean(
          box && at.x >= box.x && at.x <= box.x + box.w && at.y >= box.y && at.y <= box.y + box.h,
        );
        drag.current = { x: at.x, y: at.y, box, move: Boolean(inside) };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        const at = point(event);
        if (current.move && current.box) {
          setBox({
            x: current.box.x + at.x - current.x,
            y: current.box.y + at.y - current.y,
            w: current.box.w,
            h: current.box.h,
          });
          return;
        }
        setBox(normalize(current.x, current.y, at.x, at.y));
      }}
      onPointerUp={() => { drag.current = null; }}
    >
      {url ? <img ref={imageRef} src={url} alt="" draggable={false} /> : null}
      {box ? null : <div className="shot-dim" />}
      {box && box.w > 2 && box.h > 2 ? (
        <div
          className="shot-hole"
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        >
          <span>{Math.round(box.w)} × {Math.round(box.h)}</span>
          <svg
            className={tool === "select" ? "shot-draw" : "shot-draw is-ink"}
            viewBox={`0 0 ${box.w} ${box.h}`}
            onPointerDown={(event) => {
              if (tool === "select" || !box) return;
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              const next = { kind: tool, color, points: [local(event, box)] };
              draftRef.current = next;
              setDraft(next);
            }}
            onPointerMove={(event) => {
              if (!draft || !box) return;
              const spot = local(event, box);
              setDraft((current) => {
                if (!current) return current;
                const next = current.kind === "box"
                  ? { ...current, points: [current.points[0], spot] }
                  : (() => {
                    const last = current.points[current.points.length - 1];
                    if (last && Math.hypot(spot.x - last.x, spot.y - last.y) < 1.5) return current;
                    return { ...current, points: [...current.points, spot] };
                  })();
                draftRef.current = next;
                return next;
              });
            }}
            onPointerUp={() => {
              const mark = draftRef.current;
              draftRef.current = null;
              setDraft(null);
              if (!mark || mark.points.length < 2) return;
              setStrokes((items) => [...items, mark]);
            }}
          >
            {drawn.map((stroke, index) => (
              stroke.kind === "box" && stroke.points.length > 1 ? (
                <rect
                  key={index}
                  x={Math.min(stroke.points[0].x, stroke.points[1].x)}
                  y={Math.min(stroke.points[0].y, stroke.points[1].y)}
                  width={Math.abs(stroke.points[1].x - stroke.points[0].x)}
                  height={Math.abs(stroke.points[1].y - stroke.points[0].y)}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={3}
                />
              ) : (
                <path
                  key={index}
                  d={pathOf(stroke.points)}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={3}
                />
              )
            ))}
          </svg>
        </div>
      ) : null}
      {ready && box ? (
        <div
          className="shot-tools"
          style={{ left: box.x, top: toolsTop }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" className={tool === "select" ? "is-on" : ""} onClick={() => setTool("select")}>
            Move
          </button>
          <button type="button" className={tool === "pen" ? "is-on" : ""} onClick={() => setTool("pen")}>
            Draw
          </button>
          <button type="button" className={tool === "box" ? "is-on" : ""} onClick={() => setTool("box")}>
            Box
          </button>
          {COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={color === swatch ? "shot-swatch is-on" : "shot-swatch"}
              style={{ background: swatch }}
              aria-label={`Ink ${swatch}`}
              onClick={() => setColor(swatch)}
            />
          ))}
          <button type="button" className="shot-primary" onClick={() => void finish(false, box, strokes)}>
            Save
          </button>
          <button type="button" onClick={() => void finish(true, box, strokes)}>Copy</button>
          <button type="button" onClick={() => window.lumen.closeScreenshot()}>Cancel</button>
        </div>
      ) : (
        <p className="shot-hint">{note || (url ? "Drag to select a region" : "Capturing the screen")}</p>
      )}
    </main>
  );
}
