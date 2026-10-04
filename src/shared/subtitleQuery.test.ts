import { describe, expect, it } from "vitest";
import { subtitleQuery } from "./subtitleQuery";

describe("subtitleQuery", () => {
  it("turns a title into a lowercase hyphen token", () => {
    expect(subtitleQuery("2001 A Space Odyssey")).toBe("2001-a-space-odyssey");
  });

  it("drops release tags and the extension", () => {
    expect(subtitleQuery("Movie.Name.1080p.BluRay.x264.mkv")).toBe("movie-name");
  });
});
