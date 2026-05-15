import crypto from "node:crypto";
import { hsmEncryptSecret, hsmDecryptSecret } from "./hsm-vault";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** True when SoftHSM mode is active (SOFTHSM_MASTER_PASSWORD is set). */
const HSM_ENABLED = !!process.env.SOFTHSM_MASTER_PASSWORD;

/** AES-256-GCM encrypt; returns base64(iv || tag || ciphertext). */
export function encryptSecret(plaintext: string, keyHex: string): string {
  if (HSM_ENABLED) return hsmEncryptSecret(plaintext, keyHex);

  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to 32 bytes");
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(ciphertextB64: string, keyHex: string): string {
  if (HSM_ENABLED) return hsmDecryptSecret(ciphertextB64, keyHex);

  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to 32 bytes");
  }
  const buf = Buffer.from(ciphertextB64, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}
