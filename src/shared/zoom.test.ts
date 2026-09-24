import { describe, expect, it } from "vitest";
import { panBy, scaleFromWheel, zoomToward, type Zoom } from "./zoom";

const picture = { width: 200, height: 100 };
const view = { width: 200, height: 200 };
const origin = { x: 0, y: 50 };
const identity: Zoom = { scale: 1, x: 0, y: 0 };

describe("zoomToward", () => {
  it("keeps the point under the cursor fixed while zooming in", () => {
    const cursor = { x: 100, y: 100 };
    const zoomed = zoomToward(identity, origin, cursor, 2, picture, view);
    expect(zoomed.scale).toBe(2);
    const localX = (cursor.x - origin.x - zoomed.x) / zoomed.scale;
    const localY = (cursor.y - origin.y - zoomed.y) / zoomed.scale;
    expect(localX).toBeCloseTo(100);
    expect(localY).toBeCloseTo(50);
  });

  it("resets the pan when zoom returns to 1", () => {
    const zoomed = zoomToward(identity, origin, { x: 40, y: 80 }, 2, picture, view);
    expect(zoomToward(zoomed, origin, { x: 40, y: 80 }, 1, picture, view)).toEqual(identity);
  });
});

describe("scaleFromWheel", () => {
  it("eases one wheel notch and ignores a zero delta", () => {
    expect(scaleFromWheel(1, -100)).toBeGreaterThan(1.1);
    expect(scaleFromWheel(1, -100)).toBeLessThan(1.2);
    expect(scaleFromWheel(2, 0)).toBe(2);
  });

  it("returns to 1 when a zoom-out would pass the floor", () => {
    expect(scaleFromWheel(1, 100)).toBe(1);
    expect(scaleFromWheel(1.01, 80)).toBe(1);
  });
});

describe("panBy", () => {
  it("moves the picture and keeps a corner inside the view", () => {
    const zoomed: Zoom = { scale: 2, x: 0, y: 0 };
    const panned = panBy(zoomed, -1000, -1000, origin, picture, view);
    const left = origin.x + panned.x;
    const top = origin.y + panned.y;
    expect(left + picture.width * panned.scale).toBeGreaterThanOrEqual(48);
    expect(top + picture.height * panned.scale).toBeGreaterThanOrEqual(48);
  });
});
