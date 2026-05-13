import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { getServerEnv } from "@/lib/env";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

type ReconcileResult = {
  processed: number;
  confirmed: number;
  failed: number;
  errors: number;
};

/**
 * Check on-chain status of all 'pending' transactions and update accordingly.
 * - Ethereum: checks transaction receipt (status 1 = confirmed, status 0 = reverted)
 * - Solana: sendAndConfirmTransaction already waits for confirmation, so pending Solana
 *   txs are rare (only if DB write failed after confirmation). We check via RPC.
 * - Bitcoin: checks if tx is confirmed via block explorer API.
 */
export async function reconcilePendingTransactions(): Promise<ReconcileResult> {
  const pending = await db
    .select()
    .from(transactions)
    .where(eq(transactions.status, "pending"));

  const result: ReconcileResult = { processed: 0, confirmed: 0, failed: 0, errors: 0 };

  for (const tx of pending) {
    result.processed++;
    try {
      const status = await checkOnChainStatus(tx.chain, tx.txHash);
      if (status === "confirmed" || status === "failed") {
        await db
          .update(transactions)
          .set({ status })
          .where(eq(transactions.id, tx.id));
        if (status === "confirmed") result.confirmed++;
        else result.failed++;
      }
      // status === "pending" means still unconfirmed — leave as-is
    } catch {
      result.errors++;
    }
  }

  return result;
}

async function checkOnChainStatus(
  chain: string,
  txHash: string,
): Promise<"pending" | "confirmed" | "failed"> {
  if (chain === "ethereum") {
    return checkEthereumStatus(txHash);
  }
  if (chain === "solana") {
    return checkSolanaStatus(txHash);
  }
  if (chain === "bitcoin") {
    return checkBitcoinStatus(txHash);
  }
  return "pending";
}

async function checkEthereumStatus(
  txHash: string,
): Promise<"pending" | "confirmed" | "failed"> {
  const env = getServerEnv();
  const client = createPublicClient({ chain: sepolia, transport: http(env.ETH_RPC_URL) });

  const receipt = await client.getTransactionReceipt({
    hash: txHash as `0x${string}`,
  }).catch(() => null);

  if (!receipt) return "pending"; // not mined yet
  return receipt.status === "success" ? "confirmed" : "failed";
}

async function checkSolanaStatus(
  txHash: string,
): Promise<"pending" | "confirmed" | "failed"> {
  const env = getServerEnv();
  const res = await fetch(env.SOL_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSignatureStatuses",
      params: [[txHash], { searchTransactionHistory: true }],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return "pending";
  const data = await res.json();
  const status = data?.result?.value?.[0];
  if (!status) return "pending";
  if (status.err) return "failed";
  if (status.confirmationStatus === "finalized" || status.confirmationStatus === "confirmed") {
    return "confirmed";
  }
  return "pending";
}

async function checkBitcoinStatus(
  txHash: string,
): Promise<"pending" | "confirmed" | "failed"> {
  const env = getServerEnv();
  const res = await fetch(`${env.BTC_API_URL}/tx/${txHash}/status`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return "pending";
  const data = await res.json();
  return data.confirmed ? "confirmed" : "pending";
}
