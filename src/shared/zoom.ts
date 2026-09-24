export type Zoom = { scale: number; x: number; y: number };
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

export function clampZoomScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

export function nextZoomScale(scale: number, zoomIn: boolean): number {
  const next = zoomIn ? scale * 1.15 : scale / 1.15;
  if (!zoomIn && next < 1.02) return MIN_ZOOM;
  return clampZoomScale(next);
}

const WHEEL_GAIN = 0.0015;

export function scaleFromWheel(scale: number, deltaY: number): number {
  if (!Number.isFinite(scale)) return MIN_ZOOM;
  if (!Number.isFinite(deltaY) || deltaY === 0) return clampZoomScale(scale);
  const next = scale * Math.exp(-deltaY * WHEEL_GAIN);
  if (deltaY > 0 && next < 1.02) return MIN_ZOOM;
  return clampZoomScale(next);
}

function clampAxis(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

export function clampPan(zoom: Zoom, origin: Point, picture: Size, view: Size): Zoom {
  if (zoom.scale <= MIN_ZOOM) return { scale: MIN_ZOOM, x: 0, y: 0 };
  const shownW = picture.width * zoom.scale;
  const shownH = picture.height * zoom.scale;
  return {
    scale: zoom.scale,
    x: clampAxis(zoom.x, 48 - origin.x - shownW, view.width - 48 - origin.x),
    y: clampAxis(zoom.y, 48 - origin.y - shownH, view.height - 48 - origin.y),
  };
}

export function zoomToward(
  zoom: Zoom,
  origin: Point,
  cursor: Point,
  nextScale: number,
  picture: Size,
  view: Size,
): Zoom {
  const scale = clampZoomScale(nextScale);
  if (scale === MIN_ZOOM) return { scale: MIN_ZOOM, x: 0, y: 0 };
  const localX = (cursor.x - origin.x - zoom.x) / zoom.scale;
  const localY = (cursor.y - origin.y - zoom.y) / zoom.scale;
  return clampPan(
    {
      scale,
      x: cursor.x - origin.x - localX * scale,
      y: cursor.y - origin.y - localY * scale,
    },
    origin,
    picture,
    view,
  );
}

export function panBy(
  zoom: Zoom,
  dx: number,
  dy: number,
  origin: Point,
  picture: Size,
  view: Size,
): Zoom {
  return clampPan({ ...zoom, x: zoom.x + dx, y: zoom.y + dy }, origin, picture, view);
}
