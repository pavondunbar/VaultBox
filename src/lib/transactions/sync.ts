import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions, wallets, type WalletRow } from "@/lib/db/schema";
import { getServerEnv, getEtherscanApiKey } from "@/lib/env";
import { fetchEthereumHistory } from "@/lib/chains/ethereum-history";
import { fetchSolanaHistory } from "@/lib/chains/solana-history";
import { fetchBitcoinHistory } from "@/lib/chains/bitcoin-history";
import type { NormalizedTx } from "@/lib/chains/types";

const STALE_THRESHOLD_MS = 2 * 60 * 1000;

export function isSyncStale(lastSyncedAt: Date | null): boolean {
  if (!lastSyncedAt) {
    return true;
  }
  return Date.now() - lastSyncedAt.getTime() > STALE_THRESHOLD_MS;
}

async function fetchHistory(wallet: WalletRow): Promise<NormalizedTx[]> {
  if (wallet.chain === "ethereum") {
    const apiKey = getEtherscanApiKey();
    return fetchEthereumHistory(wallet.address, apiKey);
  }

  if (wallet.chain === "solana") {
    const env = getServerEnv();
    return fetchSolanaHistory(env.SOL_RPC_URL, wallet.address);
  }

  if (wallet.chain === "bitcoin") {
    const env = getServerEnv();
    return fetchBitcoinHistory(env.BTC_API_URL, wallet.address);
  }

  return [];
}

export async function syncIfStale(wallet: WalletRow): Promise<void> {
  try {
    if (!isSyncStale(wallet.lastSyncedAt)) {
      return;
    }

    const txs = await fetchHistory(wallet);

    if (txs.length > 0) {
      const values = txs.map((tx) => ({
        walletId: wallet.id,
        chain: wallet.chain,
        txHash: tx.txHash,
        kind: tx.kind,
        toAddress: tx.toAddress,
        fromAddress: tx.fromAddress,
        direction: tx.direction,
        amount: tx.amount,
        tokenSymbol: tx.tokenSymbol,
        tokenAddress: tx.tokenAddress,
        createdAt: tx.timestamp,
      }));

      await db
        .insert(transactions)
        .values(values)
        .onConflictDoNothing({
          target: [
            transactions.txHash,
            transactions.walletId,
            transactions.direction,
          ],
        });
    }

    await db
      .update(wallets)
      .set({ lastSyncedAt: new Date() })
      .where(eq(wallets.id, wallet.id));
  } catch {
    // Sync failure is non-fatal — fall back to cached DB results
  }
}
