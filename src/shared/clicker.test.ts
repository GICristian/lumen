import { describe, expect, it } from "vitest";
import { clickerButton, clickerInterval, clickerToggleVk } from "./clicker";

describe("autoclicker settings", () => {
  it("keeps the gap in a range that does not spin", () => {
    expect(clickerInterval(50)).toBe(50);
    expect(clickerInterval(1)).toBe(20);
    expect(clickerInterval(9000)).toBe(2000);
    expect(clickerInterval("no")).toBe(50);
  });

  it("accepts the three main buttons and a toggle key", () => {
    expect(clickerButton("right")).toBe("right");
    expect(clickerButton("nope")).toBe("left");
    expect(clickerToggleVk(117)).toBe(117);
    expect(clickerToggleVk(-4)).toBe(0);
  });
});
