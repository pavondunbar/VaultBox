import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
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
 * from oldKeyHex to newKeyHex.
 *
 * Each batch is wrapped in a database transaction — if any wallet in the batch
 * fails, the entire batch rolls back, leaving those wallets on the old key.
 * This prevents a crash from leaving wallets in a mixed-key state.
 */
export async function rotateEncryptionKey(
  oldKeyHex: string,
  newKeyHex: string,
  batchSize = 50,
): Promise<RotationResult> {
  if (oldKeyHex === newKeyHex) throw new Error("New key must differ from old key");
  if (!/^[0-9a-fA-F]{64}$/.test(newKeyHex)) throw new Error("New key must be 64 hex chars");

  const allWallets = await db
    .select({ id: wallets.id, encryptedPrivateKey: wallets.encryptedPrivateKey })
    .from(wallets);

  const result: RotationResult = { totalWallets: allWallets.length, rotated: 0, failed: [] };

  for (let i = 0; i < allWallets.length; i += batchSize) {
    const batch = allWallets.slice(i, i + batchSize);

    try {
      await db.transaction(async (tx) => {
        for (const w of batch) {
          const plaintext = decryptSecret(w.encryptedPrivateKey, oldKeyHex);
          const reEncrypted = encryptSecret(plaintext, newKeyHex);
          await tx
            .update(wallets)
            .set({ encryptedPrivateKey: reEncrypted })
            .where(eq(wallets.id, w.id));
        }
      });
      result.rotated += batch.length;
    } catch {
      // Entire batch failed and rolled back — wallets remain on old key
      result.failed.push(...batch.map((w) => w.id));
    }
  }

  return result;
}

/** Generate a new 256-bit key (for use in rotation ceremonies). */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
