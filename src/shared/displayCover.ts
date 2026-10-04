export type PixelRect = { left: number; top: number; right: number; bottom: number };
export type PixelDisplay = { x: number; y: number; width: number; height: number };

/** A borderless game still counts when it covers almost the whole monitor. */
export function coversDisplay(rect: PixelRect, display: PixelDisplay): boolean {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  if (display.width < 1 || display.height < 1) return false;
  if (width < display.width * 0.92 || height < display.height * 0.92) return false;
  const slackX = display.width * 0.08;
  const slackY = display.height * 0.08;
  return rect.left <= display.x + slackX
    && rect.top <= display.y + slackY
    && rect.right >= display.x + display.width - slackX
    && rect.bottom >= display.y + display.height - slackY;
}
