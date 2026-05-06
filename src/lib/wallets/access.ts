import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets, type WalletRow } from "@/lib/db/schema";

export async function getWalletForUser(
  walletId: string,
  userId: string,
): Promise<WalletRow | null> {
  const rows = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}
