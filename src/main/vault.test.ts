import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  initVault,
  vaultAdd,
  vaultCreate,
  vaultLock,
  vaultMaterialize,
  vaultUnlock,
} from "./vault";

describe("vault store", () => {
  let dir = "";

  afterEach(async () => {
    await vaultLock();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("hides the file and opens it only with the right password", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lumen-vault-"));
    const source = path.join(dir, "clip.mp4");
    await writeFile(source, Buffer.from("frame-data"));
    const store = path.join(dir, "store");
    await initVault(store);
    await vaultCreate("secret1");
    const items = await vaultAdd(source, true);
    await expect(stat(source)).rejects.toThrow();
    const catalog = await readFile(path.join(store, "index.bin"));
    expect(catalog.includes(Buffer.from("clip.mp4"))).toBe(false);
    await vaultLock();
    await expect(vaultUnlock("wrong-pass")).rejects.toThrow(/wrong password/i);
    const opened = await vaultUnlock("secret1");
    expect(opened[0]?.name).toBe("clip.mp4");
    expect(opened[0]?.id).toBe(items[0]?.id);
    const restored = await vaultMaterialize(opened[0].id);
    expect(await readFile(restored, "utf8")).toBe("frame-data");
    expect(path.basename(restored).startsWith(opened[0].id)).toBe(true);
  });
});
