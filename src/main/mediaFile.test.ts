import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mediaFileResponse } from "./mediaFile";

const folders: string[] = [];

afterEach(async () => {
  const pending = folders.splice(0);
  await Promise.all(pending.map((folder) => rm(folder, { recursive: true, force: true })));
});

describe("mediaFileResponse", () => {
  it("returns the requested slice with a partial-content header", async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "lumen-media-"));
    folders.push(folder);
    const filePath = path.join(folder, "clip.mp4");
    await writeFile(filePath, Buffer.from("0123456789abcdef"));

    const response = await mediaFileResponse(filePath, "bytes=4-7");
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(206);
    expect(body.toString()).toBe("4567");
    expect(response.headers.get("content-range")).toBe("bytes 4-7/16");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
  });

  it("returns the whole file when the player does not ask for a range", async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "lumen-media-"));
    folders.push(folder);
    const filePath = path.join(folder, "thumb.jpg");
    await writeFile(filePath, Buffer.from("jpeg-bytes"));

    const response = await mediaFileResponse(filePath, null);
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(body.toString()).toBe("jpeg-bytes");
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });
});
