import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { encryptSecret, decryptSecret } from "./vault";

export interface RotationResult {
  totalWallets: number;
  rotated: number;
  failed: string[];
}

/**
 * Rotate the master encryption key: re-encrypts all wallet private keys
 * from oldKeyHex to newKeyHex. Runs in batches to avoid long-running transactions.
 */
export async function rotateEncryptionKey(
  oldKeyHex: string,
  newKeyHex: string,
  batchSize = 50,
): Promise<RotationResult> {
  if (oldKeyHex === newKeyHex) throw new Error("New key must differ from old key");
  if (!/^[0-9a-fA-F]{64}$/.test(newKeyHex)) throw new Error("New key must be 64 hex chars");

  const allWallets = await db.select({ id: wallets.id, encryptedPrivateKey: wallets.encryptedPrivateKey }).from(wallets);
  const result: RotationResult = { totalWallets: allWallets.length, rotated: 0, failed: [] };

  for (let i = 0; i < allWallets.length; i += batchSize) {
    const batch = allWallets.slice(i, i + batchSize);
    for (const w of batch) {
      try {
        const plaintext = decryptSecret(w.encryptedPrivateKey, oldKeyHex);
        const reEncrypted = encryptSecret(plaintext, newKeyHex);
        await db.update(wallets).set({ encryptedPrivateKey: reEncrypted }).where(eq(wallets.id, w.id));
        result.rotated++;
      } catch {
        result.failed.push(w.id);
      }
    }
  }
  return result;
}

/** Generate a new 256-bit key (for use in rotation ceremonies). */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
