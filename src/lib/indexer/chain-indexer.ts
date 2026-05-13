/**
 * Real-time chain indexer.
 *
 * Continuously monitors blockchain networks for inbound transactions
 * to platform wallets. Uses WebSocket subscriptions where available
 * (Ethereum, Solana) and polling for Bitcoin.
 *
 * Architecture:
 * - Each chain has an independent indexer loop
 * - Cursors (last processed block/slot/height) are persisted in DB
 * - Detected transactions are inserted into the transactions table
 * - Emits events for monitoring/alerting integration
 */

import { db } from "@/lib/db";
import { transactions, wallets, indexerCursors } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getServerEnv } from "@/lib/env";
import { metrics } from "@/lib/monitoring/metrics";

export type IndexerEvent = {
  type: "inbound_detected";
  chain: string;
  walletId: string;
  address: string;
  txHash: string;
  amount: string;
  tokenAddress: string | null;
};

type EventHandler = (event: IndexerEvent) => void;

const eventHandlers: EventHandler[] = [];

export function onIndexerEvent(handler: EventHandler): void {
  eventHandlers.push(handler);
}

function emit(event: IndexerEvent): void {
  for (const h of eventHandlers) {
    try { h(event); } catch { /* non-fatal */ }
  }
}

// --- Cursor management ---

async function getCursor(chain: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(indexerCursors)
    .where(eq(indexerCursors.chain, chain))
    .limit(1);
  return rows[0]?.cursor ?? null;
}

async function setCursor(chain: string, cursor: string): Promise<void> {
  await db
    .insert(indexerCursors)
    .values({ chain, cursor, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [indexerCursors.chain],
      set: { cursor, updatedAt: new Date() },
    });
}

// --- Platform wallet address cache ---

async function getPlatformAddresses(chain: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: wallets.id, address: wallets.address })
    .from(wallets)
    .where(eq(wallets.chain, chain));
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.address.toLowerCase(), r.id);
  return map;
}

// --- Ethereum indexer (block polling) ---

async function indexEthereumBlock(rpcUrl: string): Promise<void> {
  const cursor = await getCursor("ethereum");
  const startBlock = cursor ? parseInt(cursor, 10) + 1 : 0;

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const { result: hexBlock } = await res.json();
  const latestBlock = parseInt(hexBlock, 16);

  if (startBlock > latestBlock) return;

  // Process up to 10 blocks per tick to avoid overload
  const endBlock = Math.min(startBlock + 9, latestBlock);
  const addresses = await getPlatformAddresses("ethereum");
  if (addresses.size === 0) return;

  for (let block = startBlock; block <= endBlock; block++) {
    const blockRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_getBlockByNumber",
        params: [`0x${block.toString(16)}`, true],
      }),
    });
    const { result: blockData } = await blockRes.json();
    if (!blockData?.transactions) continue;

    for (const tx of blockData.transactions) {
      const toAddr = (tx.to ?? "").toLowerCase();
      const walletId = addresses.get(toAddr);
      if (!walletId) continue;

      const amountWei = BigInt(tx.value);
      const amountEth = formatWei(amountWei);

      await db
        .insert(transactions)
        .values({
          walletId,
          chain: "ethereum",
          txHash: tx.hash,
          kind: "receive",
          toAddress: toAddr,
          fromAddress: tx.from,
          direction: "incoming",
          amount: amountEth,
          status: "confirmed",
          tokenSymbol: "ETH",
          tokenAddress: null,
        })
        .onConflictDoNothing();

      metrics.indexerTxProcessed.inc({ chain: "ethereum" });
      emit({ type: "inbound_detected", chain: "ethereum", walletId, address: toAddr, txHash: tx.hash, amount: amountEth, tokenAddress: null });
    }
  }

  await setCursor("ethereum", endBlock.toString());
}

// --- Solana indexer (slot polling) ---

async function indexSolanaSlots(rpcUrl: string): Promise<void> {
  const addresses = await getPlatformAddresses("solana");
  if (addresses.size === 0) return;

  // For each wallet, check recent signatures since last cursor
  for (const [address, walletId] of addresses) {
    const cursorKey = `solana:${address}`;
    const lastSig = await getCursor(cursorKey);

    const params: Record<string, unknown> = { limit: 20 };
    if (lastSig) params.until = lastSig;

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getSignaturesForAddress",
        params: [address, params],
      }),
    });
    const { result: sigs } = await res.json();
    if (!sigs || sigs.length === 0) continue;

    // Store newest signature as cursor
    await setCursor(cursorKey, sigs[0].signature);

    for (const sig of sigs) {
      if (sig.err) continue;
      await db
        .insert(transactions)
        .values({
          walletId,
          chain: "solana",
          txHash: sig.signature,
          kind: "receive",
          toAddress: address,
          fromAddress: null,
          direction: "incoming",
          amount: "0", // Will be enriched by sync
          status: "confirmed",
          tokenSymbol: "SOL",
          tokenAddress: null,
        })
        .onConflictDoNothing();

      metrics.indexerTxProcessed.inc({ chain: "solana" });
      emit({ type: "inbound_detected", chain: "solana", walletId, address, txHash: sig.signature, amount: "0", tokenAddress: null });
    }
  }
}

// --- Bitcoin indexer (polling Esplora) ---

async function indexBitcoin(apiUrl: string): Promise<void> {
  const addresses = await getPlatformAddresses("bitcoin");
  if (addresses.size === 0) return;

  for (const [address, walletId] of addresses) {
    const cursorKey = `bitcoin:${address}`;
    const lastTxid = await getCursor(cursorKey);

    const res = await fetch(`${apiUrl}/address/${address}/txs`);
    if (!res.ok) continue;
    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) continue;

    await setCursor(cursorKey, txs[0].txid);

    for (const tx of txs) {
      if (lastTxid && tx.txid === lastTxid) break;

      // Check if any output goes to our address
      for (const vout of tx.vout ?? []) {
        if (vout.scriptpubkey_address === address) {
          const amountBtc = (vout.value / 1e8).toFixed(8).replace(/\.?0+$/, "");
          await db
            .insert(transactions)
            .values({
              walletId,
              chain: "bitcoin",
              txHash: tx.txid,
              kind: "receive",
              toAddress: address,
              fromAddress: tx.vin?.[0]?.prevout?.scriptpubkey_address ?? null,
              direction: "incoming",
              amount: amountBtc,
              status: tx.status?.confirmed ? "confirmed" : "pending",
              tokenSymbol: "BTC",
              tokenAddress: null,
            })
            .onConflictDoNothing();

          metrics.indexerTxProcessed.inc({ chain: "bitcoin" });
          emit({ type: "inbound_detected", chain: "bitcoin", walletId, address, txHash: tx.txid, amount: amountBtc, tokenAddress: null });
        }
      }
    }
  }
}

// --- Utility ---

function formatWei(wei: bigint): string {
  const whole = wei / 1000000000000000000n;
  const frac = wei % 1000000000000000000n;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(18, "0").replace(/0+$/, "")}`;
}

// --- Main indexer loop ---

let running = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL_MS = parseInt(process.env.INDEXER_POLL_MS ?? "15000", 10);

async function tick(): Promise<void> {
  try {
    const env = getServerEnv();
    await Promise.allSettled([
      indexEthereumBlock(env.ETH_RPC_URL),
      indexSolanaSlots(env.SOL_RPC_URL),
      indexBitcoin(env.BTC_API_URL),
    ]);
    metrics.indexerTicksTotal.inc();
  } catch {
    metrics.indexerErrors.inc();
  }
}

export function startIndexer(): void {
  if (running) return;
  running = true;
  // Initial tick
  tick();
  intervalHandle = setInterval(tick, POLL_INTERVAL_MS);
  intervalHandle.unref();
}

export function stopIndexer(): void {
  running = false;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function isIndexerRunning(): boolean {
  return running;
}
