import { encryptSecret, decryptSecret } from "@/lib/crypto/vault";

export function generateTotpSecret(): string {
  const { TOTP } = require("otpauth") as typeof import("otpauth");
  const totp = new TOTP({ algorithm: "SHA1", digits: 6, period: 30 });
  return totp.secret.base32;
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const { TOTP, Secret } = require("otpauth") as typeof import("otpauth");
  const totp = new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export async function generateQrDataUrl(
  email: string,
  secret: string,
): Promise<string> {
  const { TOTP, Secret } = require("otpauth") as typeof import("otpauth");
  const QRCode = require("qrcode") as typeof import("qrcode");
  const totp = new TOTP({
    issuer: "VaultBox",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  const uri = totp.toString();
  return QRCode.toDataURL(uri);
}

export function encryptTotpSecret(secret: string, keyHex: string): string {
  return encryptSecret(secret, keyHex);
}

export function decryptTotpSecret(encrypted: string, keyHex: string): string {
  return decryptSecret(encrypted, keyHex);
}
