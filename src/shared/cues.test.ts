import { describe, expect, it } from "vitest";
import { bestOffset, cueAt, cueOutline, normalizeCueStyle, parseVtt, speechFromLog } from "./cues";

describe("parseVtt", () => {
  it("reads srt timestamps and strips tags", () => {
    const cues = parseVtt("1\n00:00:01,000 --> 00:00:02,500\n<i>Hello</i>\n");
    expect(cues).toEqual([{ start: 1, end: 2.5, text: "Hello" }]);
  });
});

describe("cueAt", () => {
  const cues = [{ start: 1, end: 2, text: "Hello" }];

  it("shows a line only inside its window plus the delay", () => {
    expect(cueAt(cues, 1.2, 0)).toBe("Hello");
    expect(cueAt(cues, 1.2, 0.5)).toBeNull();
    expect(cueAt(cues, 1.7, 0.5)).toBe("Hello");
  });
});

describe("speech alignment", () => {
  it("turns silence markers into speech spans", () => {
    const log = "silence_start: 1\nsilence_end: 2\nsilence_start: 4\n";
    expect(speechFromLog(log, 5)).toEqual([
      [0, 1],
      [2, 4],
    ]);
  });

  it("keeps a saved subtitle look inside the allowed range", () => {
    expect(normalizeCueStyle({
      size: 30,
      color: "#ffe56a",
      backdrop: 0.4,
      outline: 3,
      lift: 12,
    })).toEqual({
      size: 30,
      color: "#ffe56a",
      backdrop: 0.4,
      outline: 3,
      lift: 12,
    });
    expect(normalizeCueStyle({ size: 99, color: "red", outline: -1 }).outline).toBe(0);
  });

  it("builds a glyph outline and clears it at zero", () => {
    expect(cueOutline(0)).toBe("none");
    expect(cueOutline(2).split(",")).toHaveLength(8);
  });

  it("picks the offset that lands cues on speech", () => {
    const cues = [{ start: 0, end: 1, text: "A" }];
    const speech: Array<[number, number]> = [[3, 4]];
    expect(bestOffset(cues, speech, 5, 0.5)).toBe(2.5);
  });
});
