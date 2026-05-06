import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
} from "@/lib/crypto/vault";

const KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("vault encryption", () => {
  it("round-trips plaintext", () => {
    const plain = "secret-key-material";
    const enc = encryptSecret(plain, KEY);
    expect(decryptSecret(enc, KEY)).toBe(plain);
  });

  it("round-trips unicode", () => {
    const plain = "你好 🔐 custodial";
    const enc = encryptSecret(plain, KEY);
    expect(decryptSecret(enc, KEY)).toBe(plain);
  });

  it("uses random IV so ciphertext differs each time", () => {
    const a = encryptSecret("same", KEY);
    const b = encryptSecret("same", KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe("same");
    expect(decryptSecret(b, KEY)).toBe("same");
  });

  it("fails authentication with wrong key", () => {
    const enc = encryptSecret("x", KEY);
    const wrong =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(() => decryptSecret(enc, wrong)).toThrow();
  });

  it("throws when encryption key is not 32 bytes hex", () => {
    expect(() => encryptSecret("x", "abcd")).toThrow();
  });
});
