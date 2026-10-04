import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { VaultItem } from "@shared/contracts";
import { openBytes, sealBytes, vaultKey, vaultSalt } from "@shared/vaultCrypto";

const CHECK = Buffer.from("lumen-vault");

let root = "";
let key: Buffer | null = null;
let items: VaultItem[] = [];
let queue: Promise<unknown> = Promise.resolve();

function run<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function requireKey(): Buffer {
  if (!key) throw new Error("The vault is locked");
  return key;
}

async function readGate(): Promise<{ salt: Buffer; check: Buffer } | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(root, "gate.json"), "utf8")) as {
      salt?: string;
      check?: string;
    };
    if (!raw.salt || !raw.check) return null;
    return { salt: Buffer.from(raw.salt, "base64"), check: Buffer.from(raw.check, "base64") };
  } catch {
    return null;
  }
}

async function writeCatalog(session: Buffer): Promise<void> {
  const body = sealBytes(Buffer.from(JSON.stringify(items)), session);
  await writeFile(path.join(root, "index.bin"), body);
}

async function readCatalog(session: Buffer): Promise<VaultItem[]> {
  try {
    const body = await readFile(path.join(root, "index.bin"));
    const parsed = JSON.parse(openBytes(body, session).toString("utf8")) as VaultItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function encryptFile(source: string, dest: string, session: Buffer): Promise<void> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", session, iv);
  const part = `${dest}.part`;
  try {
    await pipeline(createReadStream(source), cipher, createWriteStream(part));
    await writeFile(dest, Buffer.concat([iv, cipher.getAuthTag()]));
    await pipeline(createReadStream(part), createWriteStream(dest, { flags: "a" }));
  } finally {
    await unlink(part).catch(() => undefined);
  }
}

async function decryptFile(source: string, dest: string, session: Buffer): Promise<void> {
  const header = Buffer.alloc(28);
  const handle = await open(source, "r");
  try {
    const read = await handle.read(header, 0, 28, 0);
    if (read.bytesRead < 28) throw new Error("Vault data is damaged");
  } finally {
    await handle.close();
  }
  const decipher = createDecipheriv("aes-256-gcm", session, header.subarray(0, 12));
  decipher.setAuthTag(header.subarray(12, 28));
  await pipeline(createReadStream(source, { start: 28 }), decipher, createWriteStream(dest));
}

export function initVault(directory: string): Promise<void> {
  root = directory;
  return run(async () => {
    await mkdir(path.join(root, "d"), { recursive: true });
    await mkdir(path.join(root, "t"), { recursive: true });
    await rm(path.join(root, "play"), { recursive: true, force: true });
    await mkdir(path.join(root, "play"), { recursive: true });
  });
}

export function isVaultPath(filePath: string): boolean {
  if (!root) return false;
  const base = path.resolve(root) + path.sep;
  return path.resolve(filePath).startsWith(base);
}

export async function vaultStatus(): Promise<{ exists: boolean; open: boolean }> {
  const gate = await readGate();
  return { exists: Boolean(gate), open: Boolean(key) };
}

export function vaultCreate(password: string): Promise<VaultItem[]> {
  return run(async () => {
    if (password.length < 6) throw new Error("Use at least 6 characters");
    if (await readGate()) throw new Error("The vault already exists");
    const salt = vaultSalt();
    const session = vaultKey(password, salt);
    const check = sealBytes(CHECK, session);
    await writeFile(
      path.join(root, "gate.json"),
      JSON.stringify({ salt: salt.toString("base64"), check: check.toString("base64") }),
    );
    items = [];
    await writeCatalog(session);
    key = session;
    return items;
  });
}

export function vaultUnlock(password: string): Promise<VaultItem[]> {
  return run(async () => {
    const gate = await readGate();
    if (!gate) throw new Error("The vault has no password yet");
    const session = vaultKey(password, gate.salt);
    try {
      const opened = openBytes(gate.check, session);
      if (!opened.equals(CHECK)) throw new Error("Wrong password");
    } catch {
      session.fill(0);
      throw new Error("Wrong password");
    }
    items = await readCatalog(session);
    key = session;
    return items;
  });
}

export function vaultList(): VaultItem[] {
  requireKey();
  return items;
}

export function vaultAdd(filePath: string, move: boolean): Promise<VaultItem[]> {
  return run(async () => {
    const session = requireKey();
    const resolved = path.resolve(filePath);
    const base = path.resolve(root) + path.sep;
    if (resolved.startsWith(base)) throw new Error("That file is already stored");
    const id = randomBytes(16).toString("hex");
    const dest = path.join(root, "d", id);
    const previous = items;
    try {
      await encryptFile(resolved, dest, session);
      const info = await stat(resolved);
      items = [...items, { id, name: path.basename(resolved), bytes: info.size }];
      await writeCatalog(session);
    } catch (error) {
      items = previous;
      await rm(dest, { force: true });
      throw error;
    }
    if (move) {
      try {
        await unlink(resolved);
      } catch {
        throw new Error("Saved in the vault. The original file is still on disk.");
      }
    }
    return items;
  });
}

export function vaultRemove(id: string): Promise<VaultItem[]> {
  return run(async () => {
    const session = requireKey();
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Unknown item");
    items = items.filter((item) => item.id !== id);
    await writeCatalog(session);
    await rm(path.join(root, "d", id), { force: true });
    await rm(path.join(root, "t", id), { force: true });
    return items;
  });
}

function assertId(id: string): void {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Unknown item");
}

function posterData(jpeg: Buffer): string {
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export function vaultReadPoster(id: string): Promise<string | null> {
  return run(async () => {
    const session = requireKey();
    assertId(id);
    try {
      const jpeg = openBytes(await readFile(path.join(root, "t", id)), session);
      return posterData(jpeg);
    } catch {
      return null;
    }
  });
}

export function vaultStorePoster(id: string, jpeg: Buffer): Promise<string> {
  return run(async () => {
    const session = requireKey();
    assertId(id);
    if (!items.some((item) => item.id === id)) throw new Error("Unknown item");
    if (jpeg.length < 100 || jpeg.length > 2_000_000) throw new Error("Poster was not saved");
    await writeFile(path.join(root, "t", id), sealBytes(jpeg, session));
    return posterData(jpeg);
  });
}

export function vaultCopyKey(): Buffer | null {
  return key ? Buffer.from(key) : null;
}

/** Decrypts with a key copy so a poster does not block playback. */
export async function vaultDecryptOutside(id: string, dest: string, session: Buffer): Promise<void> {
  assertId(id);
  if (!items.some((item) => item.id === id)) throw new Error("Unknown item");
  const resolved = path.resolve(dest);
  const base = path.resolve(root) + path.sep;
  if (resolved.startsWith(base)) throw new Error("That file is already stored");
  await decryptFile(path.join(root, "d", id), resolved, session);
}

export function vaultMaterialize(id: string): Promise<string> {
  return run(async () => {
    const session = requireKey();
    const item = items.find((entry) => entry.id === id);
    if (!item || !/^[a-f0-9]{32}$/.test(id)) throw new Error("Unknown item");
    const ext = path.extname(item.name).toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : "";
    const dest = path.join(root, "play", `${id}${safeExt}`);
    await decryptFile(path.join(root, "d", id), dest, session);
    return dest;
  });
}

export function vaultLock(): Promise<void> {
  return run(async () => {
    if (key) {
      key.fill(0);
      key = null;
    }
    items = [];
    if (!root) return;
    try {
      await rm(path.join(root, "play"), { recursive: true, force: true });
      await mkdir(path.join(root, "play"), { recursive: true });
    } catch (error) {
      console.error("vault play cleanup failed", error);
    }
  });
}
