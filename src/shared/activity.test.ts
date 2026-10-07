import { describe, expect, it } from "vitest";
import { normalizeActivity, pushActivity } from "./activity";

describe("activity", () => {
  it("keeps the five newest actions and moves a repeat to the front", () => {
    let items = [] as ReturnType<typeof pushActivity>;
    for (let index = 0; index < 6; index += 1) {
      items = pushActivity(items, {
        kind: "recorded",
        path: `C:/Lumen/osu!/clip-${index}.mp4`,
        at: index,
      });
    }
    expect(items).toHaveLength(5);
    expect(items[0]?.path).toContain("clip-5");
    expect(items.some((item) => item.path.includes("clip-0"))).toBe(false);
    items = pushActivity(items, {
      kind: "exported",
      path: "C:/Lumen/osu!/clip-5.mp4",
      at: 9,
    });
    expect(items[0]?.kind).toBe("exported");
    expect(items.filter((item) => item.path.includes("clip-5"))).toHaveLength(2);
  });

  it("drops rows that are not a recorded or exported clip", () => {
    expect(normalizeActivity([{ kind: "deleted", path: "a", at: 1 }, { kind: "recorded", path: "b", at: 2 }]))
      .toEqual([{ id: "recorded:2", kind: "recorded", path: "b", at: 2 }]);
  });
});
