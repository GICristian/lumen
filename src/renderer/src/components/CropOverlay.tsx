import {
  moveCrop,
  presetCrop,
  resizeCrop,
  videoRectToScreen,
  type CropEdge,
  type ScreenBox,
  type VideoRect,
} from "@shared/crop";

type Props = {
  rect: VideoRect;
  frame: { width: number; height: number };
  videoBox: ScreenBox;
  aspect: number | null;
  onChange: (rect: VideoRect) => void;
  onAspect: (aspect: number | null) => void;
};

const handles: CropEdge[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function CropOverlay({ rect, frame, videoBox, aspect, onChange, onAspect }: Props) {
  const screen = videoRectToScreen(rect, videoBox, frame.width, frame.height);
  const local = {
    left: screen.left - videoBox.left,
    top: screen.top - videoBox.top,
    width: screen.width,
    height: screen.height,
  };

  function drag(
    mode: "move" | CropEdge,
    event: React.PointerEvent<HTMLElement>,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const origin = rect;
    const startX = event.clientX;
    const startY = event.clientY;
    const scaleX = frame.width / videoBox.width;
    const scaleY = frame.height / videoBox.height;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent): void => {
      const dx = (ev.clientX - startX) * scaleX;
      const dy = (ev.clientY - startY) * scaleY;
      onChange(
        mode === "move"
          ? moveCrop(origin, dx, dy, frame)
          : resizeCrop(origin, dx, dy, mode, frame, aspect),
      );
    };
    const up = (): void => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  function choose(next: number | null): void {
    onAspect(next);
    if (next === null) return;
    onChange(presetCrop(frame.width, frame.height, next));
  }

  return (
    <div
      className="image-frame"
      style={{
        left: videoBox.left,
        top: videoBox.top,
        width: videoBox.width,
        height: videoBox.height,
      }}
    >
      <div
        className="crop-rect"
        style={local}
        onPointerDown={(event) => drag("move", event)}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {handles.map((edge) => (
          <button
            key={edge}
            type="button"
            className={`crop-handle handle-${edge}`}
            aria-label={`Resize ${edge}`}
            onPointerDown={(event) => drag(edge, event)}
          />
        ))}
      </div>
      <div className="crop-chips" onClick={(event) => event.stopPropagation()}>
        <button type="button" className={aspect === null ? "is-on" : ""} onClick={() => choose(null)}>
          Free
        </button>
        <button type="button" className={aspect === 16 / 9 ? "is-on" : ""} onClick={() => choose(16 / 9)}>
          16:9
        </button>
        <button type="button" className={aspect === 9 / 16 ? "is-on" : ""} onClick={() => choose(9 / 16)}>
          9:16
        </button>
        <button type="button" className={aspect === 1 ? "is-on" : ""} onClick={() => choose(1)}>
          1:1
        </button>
      </div>
    </div>
  );
}
