import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export const VAULT_KEY_BYTES = 32;

export function vaultSalt(): Buffer {
  return randomBytes(16);
}

/** Derives the session key. The password itself is never stored. */
export function vaultKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, VAULT_KEY_BYTES, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
}

/** Packs iv, auth tag, and ciphertext so a wrong key fails closed. */
export function sealBytes(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function openBytes(blob: Buffer, key: Buffer): Buffer {
  if (blob.length < 28) throw new Error("Vault data is damaged");
  const decipher = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}
