import { formatSatoshis } from "@/lib/chains/bitcoin";
import type { NormalizedTx } from "@/lib/chains/types";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 50;

type BlockstreamTx = {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: { prevout: { scriptpubkey_address?: string; value: number } }[];
  vout: { scriptpubkey_address?: string; value: number }[];
};

export async function fetchBitcoinHistory(
  apiUrl: string,
  walletAddress: string,
): Promise<NormalizedTx[]> {
  try {
    const res = await fetch(
      `${apiUrl}/address/${walletAddress}/txs`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return [];

    const txs = (await res.json()) as BlockstreamTx[];
    const normalized: NormalizedTx[] = [];

    for (const tx of txs.slice(0, MAX_RESULTS)) {
      const inputAddrs = new Set(
        tx.vin.map((v) => v.prevout?.scriptpubkey_address).filter(Boolean),
      );
      const isOutgoing = inputAddrs.has(walletAddress);

      if (isOutgoing) {
        for (const out of tx.vout) {
          if (out.scriptpubkey_address && out.scriptpubkey_address !== walletAddress && out.value > 0) {
            normalized.push({
              txHash: tx.txid,
              fromAddress: walletAddress,
              toAddress: out.scriptpubkey_address,
              amount: formatSatoshis(out.value),
              tokenSymbol: "BTC",
              tokenAddress: null,
              direction: "outgoing",
              kind: "send",
              timestamp: new Date((tx.status.block_time ?? Math.floor(Date.now() / 1000)) * 1000),
            });
            break;
          }
        }
      } else {
        const received = tx.vout
          .filter((o) => o.scriptpubkey_address === walletAddress)
          .reduce((s, o) => s + o.value, 0);
        if (received > 0) {
          const sender = tx.vin[0]?.prevout?.scriptpubkey_address ?? "unknown";
          normalized.push({
            txHash: tx.txid,
            fromAddress: sender,
            toAddress: walletAddress,
            amount: formatSatoshis(received),
            tokenSymbol: "BTC",
            tokenAddress: null,
            direction: "incoming",
            kind: "receive",
            timestamp: new Date((tx.status.block_time ?? Math.floor(Date.now() / 1000)) * 1000),
          });
        }
      }
    }

    return normalized;
  } catch {
    return [];
  }
}
