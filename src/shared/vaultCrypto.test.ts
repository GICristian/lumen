import { describe, expect, it } from "vitest";
import { openBytes, sealBytes, vaultKey, vaultSalt } from "./vaultCrypto";

describe("vault crypto", () => {
  it("round-trips a catalog and rejects the wrong password", () => {
    const salt = vaultSalt();
    const key = vaultKey("correct horse", salt);
    const sealed = sealBytes(Buffer.from('[{"id":"a"}]'), key);
    expect(openBytes(sealed, key).toString()).toBe('[{"id":"a"}]');
    expect(() => openBytes(sealed, vaultKey("wrong horse", salt))).toThrow();
  });
});
