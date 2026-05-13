import { db } from "@/lib/db";
import type { DbContext } from "@/lib/db/types";
import { ledgerEntries } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export async function verifyLedgerBalance(txHash: string): Promise<{
  balanced: boolean;
  totalDebits: string;
  totalCredits: string;
  tokenAddress: string | null;
}> {
  const entries = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.txHash, txHash));

  if (entries.length === 0) {
    return { balanced: false, totalDebits: "0", totalCredits: "0", tokenAddress: null };
  }

  const tokenAddress = entries[0].tokenAddress;

  const debits = entries.filter((e) => e.entryType === "debit");
  const credits = entries.filter((e) => e.entryType === "credit");

  const sumDebits = debits.reduce((sum, e) => sum + BigInt(e.amount), BigInt(0));
  const sumCredits = credits.reduce((sum, e) => sum + BigInt(e.amount), BigInt(0));

  return {
    balanced: sumDebits === sumCredits,
    totalDebits: sumDebits.toString(),
    totalCredits: sumCredits.toString(),
    tokenAddress,
  };
}

export async function getWalletBalanceFromLedger(
  walletId: string,
  tokenAddress: string | null,
  ctx: DbContext = db,
): Promise<string> {
  const result = await ctx
    .select({
      balance: sql<string>`COALESCE(
        SUM(CASE WHEN ${ledgerEntries.entryType} = 'credit' THEN ${ledgerEntries.amount}::numeric ELSE 0 END) -
        SUM(CASE WHEN ${ledgerEntries.entryType} = 'debit' THEN ${ledgerEntries.amount}::numeric ELSE 0 END),
        0
      )`.as("balance"),
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.walletId, walletId),
        tokenAddress
          ? eq(ledgerEntries.tokenAddress, tokenAddress)
          : isNull(ledgerEntries.tokenAddress),
      ),
    );

  const raw = result[0]?.balance ?? "0";
  // Clamp to "0" if ledger is in a negative state (debits > credits)
  return raw.startsWith("-") ? "0" : raw;
}
