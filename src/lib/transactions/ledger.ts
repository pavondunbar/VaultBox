import { db } from "@/lib/db";
import type { DbContext } from "@/lib/db/types";
import { ledgerEntries, walletBalances } from "@/lib/db/schema";
import { sql, and, eq } from "drizzle-orm";

export type LedgerEntry = {
  txHash: string;
  walletId: string;
  chain: string;
  entryType: "debit" | "credit";
  amount: string;
  tokenSymbol: string | null;
  tokenAddress: string | null;
};

export async function recordLedgerEntries(
  entries: LedgerEntry[],
  ctx: DbContext = db,
): Promise<void> {
  if (entries.length === 0) return;

  const values = entries.map((e) => ({
    txHash: e.txHash,
    walletId: e.walletId,
    chain: e.chain,
    entryType: e.entryType,
    amount: e.amount,
    tokenSymbol: e.tokenSymbol,
    tokenAddress: e.tokenAddress,
  }));

  await ctx.insert(ledgerEntries).values(values).onConflictDoNothing({
    target: [ledgerEntries.txHash, ledgerEntries.walletId, ledgerEntries.entryType],
  });

  // Update materialized wallet_balances
  for (const entry of entries) {
    const delta = entry.entryType === "credit" ? entry.amount : `-${entry.amount}`;
    await ctx
      .insert(walletBalances)
      .values({
        walletId: entry.walletId,
        chain: entry.chain,
        tokenSymbol: entry.tokenSymbol,
        tokenAddress: entry.tokenAddress,
        balance: entry.amount,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [walletBalances.walletId, walletBalances.tokenAddress],
        set: {
          balance: sql`(${walletBalances.balance}::numeric + ${delta}::numeric)::text`,
          updatedAt: new Date(),
        },
      });
  }
}

export function createDebitCreditPair(params: {
  txHash: string;
  fromWalletId: string;
  toWalletId: string;
  chain: string;
  amount: string;
  tokenSymbol: string | null;
  tokenAddress: string | null;
}): LedgerEntry[] {
  return [
    {
      txHash: params.txHash,
      walletId: params.fromWalletId,
      chain: params.chain,
      entryType: "debit",
      amount: params.amount,
      tokenSymbol: params.tokenSymbol,
      tokenAddress: params.tokenAddress,
    },
    {
      txHash: params.txHash,
      walletId: params.toWalletId,
      chain: params.chain,
      entryType: "credit",
      amount: params.amount,
      tokenSymbol: params.tokenSymbol,
      tokenAddress: params.tokenAddress,
    },
  ];
}
