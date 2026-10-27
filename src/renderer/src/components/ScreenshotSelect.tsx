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
  const closing = useRef(false);
  const session = useRef(0);
  const overTools = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [aim, setAim] = useState<Point | null>(null);
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
      setDragging(false);
      drag.current = null;
      overTools.current = false;
      setAim(null);
      closing.current = false;
      session.current += 1;
    });
    const pointer = window.lumen.onScreenshotPointer((event) => {
      const at = { x: event.x, y: event.y };
      setAim(at);
      if (event.phase === "down") {
        const button = toolButton(at);
        if (button) {
          overTools.current = true;
          return;
        }
        overTools.current = false;
        const current = state.current;
        const region = current.box;
        const inside = Boolean(
          region
          && at.x >= region.x
          && at.x <= region.x + region.w
          && at.y >= region.y
          && at.y <= region.y + region.h,
        );
        if ((current.tool === "pen" || current.tool === "box") && region && inside) {
          const next: Stroke = {
            kind: current.tool,
            color: current.color,
            points: [{ x: at.x - region.x, y: at.y - region.y }],
          };
          draftRef.current = next;
          setDraft(next);
          return;
        }
        begin(at);
        return;
      }
      if (event.phase === "up") {
        if (overTools.current) {
          overTools.current = false;
          toolButton(at)?.click();
          return;
        }
        const mark = draftRef.current;
        if (mark) {
          draftRef.current = null;
          setDraft(null);
          if (mark.points.length >= 2) setStrokes((items) => [...items, mark]);
          return;
        }
        drag.current = null;
        setDragging(false);
        return;
      }
      const current = state.current;
      const ink = draftRef.current;
      if (ink && current.box) {
        const spot = { x: at.x - current.box.x, y: at.y - current.box.y };
        const next = ink.kind === "box"
          ? { ...ink, points: [ink.points[0], spot] }
          : (() => {
            const last = ink.points[ink.points.length - 1];
            if (last && Math.hypot(spot.x - last.x, spot.y - last.y) < 1.5) return ink;
            return { ...ink, points: [...ink.points, spot] };
          })();
        draftRef.current = next;
        setDraft(next);
        return;
      }
      place(at);
    });
    return () => {
      gone = true;
      stop();
      reset();
      command();
      pointer();
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
      if (event.key === "Enter") {
        event.preventDefault();
        void finish(true, current.box, current.strokes);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void finish(false, current.box, current.strokes);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toolButton(at: Point): HTMLButtonElement | null {
    const tools = document.querySelector(".shot-tools");
    if (!tools) return null;
    const buttons = tools.querySelectorAll("button");
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      const hit = at.x >= rect.left && at.x <= rect.right && at.y >= rect.top && at.y <= rect.bottom;
      if (hit) return button;
    }
    return null;
  }

  function begin(at: Point): void {
    if (state.current.tool !== "select") return;
    const region = state.current.box;
    const inside = Boolean(
      region
      && at.x >= region.x
      && at.x <= region.x + region.w
      && at.y >= region.y
      && at.y <= region.y + region.h,
    );
    drag.current = { x: at.x, y: at.y, box: region, move: inside };
    setDragging(true);
  }

  function place(at: Point): void {
    const current = drag.current;
    if (!current) return;
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
  }

  function loadedImage(): HTMLImageElement | null {
    const image = imageRef.current;
    if (!image || !image.complete || !image.naturalWidth) return null;
    return image;
  }

  function waitForImage(): Promise<HTMLImageElement | null> {
    const found = loadedImage();
    if (found) return Promise.resolve(found);
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        const image = loadedImage();
        if (image || Date.now() - started > 2500) {
          window.clearInterval(timer);
          resolve(image);
        }
      }, 40);
    });
  }

  async function finish(copy: boolean, region: Box | null, marks: Stroke[]): Promise<void> {
    if (closing.current || !region || region.w < 8 || region.h < 8) return;
    closing.current = true;
    const mine = session.current;
    const ink = marks.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((spot) => ({ ...spot })),
    }));
    const view = { w: window.innerWidth, h: window.innerHeight };
    window.lumen.closeScreenshot();
    const image = await waitForImage();
    if (!image || session.current !== mine || view.w < 1 || view.h < 1) return;
    const scaleX = image.naturalWidth / view.w;
    const scaleY = image.naturalHeight / view.h;
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
    for (const stroke of ink) {
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
    if (copy) void window.lumen.copyScreenshot(bytes);
    else void window.lumen.saveScreenshot(bytes);
  }

  const ready = box && box.w > 8 && box.h > 8;
  const toolsTop = box
    ? (box.y + box.h + 84 < window.innerHeight ? box.y + box.h + 8 : Math.max(8, box.y - 78))
    : 0;
  const drawn = draft ? [...strokes, draft] : strokes;

  return (
    <main className="shot-stage">
      {url ? <img ref={imageRef} src={url} alt="" draggable={false} /> : null}
      {box && box.w > 2 && box.h > 2 ? (
        <>
          <div className="shot-shade" style={{ left: 0, top: 0, right: 0, height: box.y }} />
          <div className="shot-shade" style={{ left: 0, top: box.y, width: box.x, height: box.h }} />
          <div
            className="shot-shade"
            style={{ left: box.x + box.w, top: box.y, right: 0, height: box.h }}
          />
          <div className="shot-shade" style={{ left: 0, top: box.y + box.h, right: 0, bottom: 0 }} />
        </>
      ) : <div className="shot-dim" />}
      {box && box.w > 2 && box.h > 2 ? (
        <div
          className="shot-hole"
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        >
          <span>{Math.round(box.w)} × {Math.round(box.h)}</span>
          <svg
            className="shot-draw"
            viewBox={`0 0 ${box.w} ${box.h}`}
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
      {ready && box && !dragging ? (
        <div
          className="shot-tools"
          style={{ left: box.x, top: toolsTop }}
        >
          <button type="button" className="shot-primary" onClick={() => void finish(true, box, strokes)}>
            Copy
          </button>
          <button type="button" onClick={() => void finish(false, box, strokes)}>Save</button>
          <button type="button" className={tool === "pen" ? "is-on" : ""} onClick={() => setTool(tool === "pen" ? "select" : "pen")}>
            Draw
          </button>
          {tool === "pen" ? COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={color === swatch ? "shot-swatch is-on" : "shot-swatch"}
              style={{ background: swatch }}
              aria-label={`Ink ${swatch}`}
              onClick={() => setColor(swatch)}
            />
          )) : null}
          <button type="button" onClick={() => window.lumen.closeScreenshot()}>Close</button>
        </div>
      ) : null}
      {aim ? <div className="shot-cursor" style={{ left: aim.x, top: aim.y }} /> : null}
      {note ? <p className="shot-hint">{note}</p> : null}
    </main>
  );
}
