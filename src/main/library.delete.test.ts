import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deleteVideos } from "./library";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("deleteVideos", () => {
  it("removes video files and refuses other paths", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lumen-delete-"));
    dirs.push(dir);
    const clip = path.join(dir, "clip.mp4");
    const note = path.join(dir, "note.txt");
    await writeFile(clip, "video");
    await writeFile(note, "text");

    const result = await deleteVideos([clip, note, path.join(dir, "missing.mp4")]);

    expect(result.deleted).toEqual([clip]);
    expect(result.failed).toEqual([note, path.join(dir, "missing.mp4")]);
  });
});
