import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSettings, writeSettings } from "./settings";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("settings file", () => {
  it("restores the previous settings when a restart leaves the file empty", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lumen-settings-"));
    roots.push(root);
    const file = path.join(root, "settings.json");
    const first = await readSettings(file);
    await writeSettings(file, { ...first, replayMicLabel: "Headset Microphone", volume: 0.4 });
    await writeSettings(file, { ...first, replayMicLabel: "Headset Microphone", volume: 0.2 });
    await fs.writeFile(file, "");
    const restored = await readSettings(file);
    expect(restored.volume).toBe(0.2);
    expect(restored.replayMicLabel).toBe("Headset Microphone");
    expect(JSON.parse(await fs.readFile(file, "utf8")).volume).toBe(0.2);
  });
});
