import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  verifyTotpCode,
  generateQrDataUrl,
  encryptTotpSecret,
  decryptTotpSecret,
} from "@/lib/auth/totp";

const TEST_ENCRYPTION_KEY = "a".repeat(64);

describe("totp", () => {
  it("generates a base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(secret.length).toBeGreaterThanOrEqual(16);
  });

  it("verifies a valid code generated from secret", () => {
    const { TOTP, Secret } = require("otpauth");
    const secret = generateTotpSecret();
    const totp = new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
    const code = totp.generate();
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("rejects an invalid code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "000000")).toBe(false);
  });

  it("accepts codes within window tolerance", () => {
    const { TOTP, Secret } = require("otpauth");
    const secret = generateTotpSecret();
    const totp = new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
    const code = totp.generate();
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("encrypts and decrypts secret round-trip", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret, TEST_ENCRYPTION_KEY);
    expect(encrypted).not.toBe(secret);
    const decrypted = decryptTotpSecret(encrypted, TEST_ENCRYPTION_KEY);
    expect(decrypted).toBe(secret);
  });

  it("generates a QR data URL", async () => {
    const secret = generateTotpSecret();
    const dataUrl = await generateQrDataUrl("test@example.com", secret);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
