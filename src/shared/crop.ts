export type VideoRect = { x: number; y: number; w: number; h: number };
export type ScreenBox = { left: number; top: number; width: number; height: number };
export type FrameSize = { width: number; height: number };

function evenDown(value: number): number {
  return Math.floor(value / 2) * 2;
}

export function evenRect(rect: VideoRect, frame: FrameSize): VideoRect {
  const frameW = Math.max(2, evenDown(frame.width));
  const frameH = Math.max(2, evenDown(frame.height));
  let x = evenDown(Math.max(0, rect.x));
  let y = evenDown(Math.max(0, rect.y));
  let w = Math.max(2, evenDown(rect.w));
  let h = Math.max(2, evenDown(rect.h));

  if (x > frameW - 2) x = frameW - 2;
  if (y > frameH - 2) y = frameH - 2;
  if (x + w > frameW) x = Math.max(0, evenDown(frameW - w));
  if (y + h > frameH) y = Math.max(0, evenDown(frameH - h));
  if (x + w > frameW) w = Math.max(2, evenDown(frameW - x));
  if (y + h > frameH) h = Math.max(2, evenDown(frameH - y));

  return { x, y, w, h };
}

export function containedVideoBox(
  container: ScreenBox,
  videoWidth: number,
  videoHeight: number,
): ScreenBox {
  const scale = Math.min(container.width / videoWidth, container.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: container.left + (container.width - width) / 2,
    top: container.top + (container.height - height) / 2,
    width,
    height,
  };
}

export function mapCropToVideoPixels(
  displayRect: ScreenBox,
  videoBox: ScreenBox,
  videoWidth: number,
  videoHeight: number,
): VideoRect {
  const scaleX = videoWidth / videoBox.width;
  const scaleY = videoHeight / videoBox.height;
  return evenRect(
    {
      x: (displayRect.left - videoBox.left) * scaleX,
      y: (displayRect.top - videoBox.top) * scaleY,
      w: displayRect.width * scaleX,
      h: displayRect.height * scaleY,
    },
    { width: videoWidth, height: videoHeight },
  );
}

export function videoRectToScreen(
  rect: VideoRect,
  videoBox: ScreenBox,
  videoWidth: number,
  videoHeight: number,
): ScreenBox {
  const scaleX = videoBox.width / videoWidth;
  const scaleY = videoBox.height / videoHeight;
  return {
    left: videoBox.left + rect.x * scaleX,
    top: videoBox.top + rect.y * scaleY,
    width: rect.w * scaleX,
    height: rect.h * scaleY,
  };
}

export function defaultCrop(videoWidth: number, videoHeight: number): VideoRect {
  const w = videoWidth * 0.8;
  const h = videoHeight * 0.8;
  return evenRect(
    { x: (videoWidth - w) / 2, y: (videoHeight - h) / 2, w, h },
    { width: videoWidth, height: videoHeight },
  );
}

export function presetCrop(
  videoWidth: number,
  videoHeight: number,
  aspect: number,
): VideoRect {
  let w = videoWidth;
  let h = w / aspect;
  if (h > videoHeight) {
    h = videoHeight;
    w = h * aspect;
  }
  return evenRect(
    { x: (videoWidth - w) / 2, y: (videoHeight - h) / 2, w, h },
    { width: videoWidth, height: videoHeight },
  );
}

export function moveCrop(
  rect: VideoRect,
  dx: number,
  dy: number,
  frame: FrameSize,
): VideoRect {
  return evenRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, frame);
}

export type CropEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function resizeCrop(
  rect: VideoRect,
  dx: number,
  dy: number,
  edge: CropEdge,
  frame: FrameSize,
  aspect: number | null,
): VideoRect {
  let x = rect.x;
  let y = rect.y;
  let w = rect.w;
  let h = rect.h;
  if (edge.includes("e")) w += dx;
  if (edge.includes("w")) {
    x += dx;
    w -= dx;
  }
  if (edge.includes("s")) h += dy;
  if (edge.includes("n")) {
    y += dy;
    h -= dy;
  }
  if (aspect && aspect > 0) {
    if (edge === "n" || edge === "s") w = h * aspect;
    else h = w / aspect;
  }
  const minW = Math.max(2, frame.width * 0.02);
  const minH = Math.max(2, frame.height * 0.02);
  if (w < minW) w = minW;
  if (h < minH) h = minH;
  return evenRect({ x, y, w, h }, frame);
}
