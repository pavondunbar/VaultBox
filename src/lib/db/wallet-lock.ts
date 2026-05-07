import { sql } from "drizzle-orm";
import type { DbContext } from "@/lib/db/types";

/**
 * Acquire a transaction-scoped advisory lock for a single wallet.
 * Uses pg_advisory_xact_lock(hashtext(walletId)) so the lock
 * auto-releases on commit or rollback.
 */
export async function acquireWalletLock(
  tx: DbContext,
  walletId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${walletId}))`,
  );
}

/**
 * Acquire advisory locks for multiple wallets in sorted order
 * to prevent deadlocks (e.g., transfer locking sender + receiver).
 */
export async function acquireWalletLocks(
  tx: DbContext,
  walletIds: string[],
): Promise<void> {
  const sorted = [...walletIds].sort();
  for (const id of sorted) {
    await acquireWalletLock(tx, id);
  }
}
