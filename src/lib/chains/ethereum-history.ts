import { formatEther, formatUnits } from "viem";
import type { NormalizedTx } from "@/lib/chains/types";

// Etherscan migrated to a unified V2 multichain API in August 2025.
// The legacy V1 endpoint (https://api-sepolia.etherscan.io/api) now returns:
//   {"status":"0","message":"NOTOK","result":"You are using a deprecated V1 endpoint…"}
// V2 requires both a `chainid` query param and an API key.
// See: https://docs.etherscan.io/v2-migration
const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";
const SEPOLIA_CHAIN_ID = "11155111";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 50;

type EtherscanTx = {
  hash: string;
  from: string;
  to: string;
  value: string;
  isError: string;
  timeStamp: string;
};

type EtherscanTokenTx = {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  contractAddress: string;
  tokenDecimal: string;
  timeStamp: string;
};

type EtherscanResponse<T> = {
  status: string;
  message?: string;
  result: T[] | string;
};

async function fetchEtherscan<T>(
  params: Record<string, string>,
): Promise<T[]> {
  const url = new URL(ETHERSCAN_V2_API);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.warn(
      `[ethereum-history] Etherscan HTTP ${response.status} for action=${params.action}`,
    );
    return [];
  }

  const data = (await response.json()) as EtherscanResponse<T>;

  // Etherscan returns status="0" for both "no results" and actual errors.
  // "No transactions found" is a normal empty result; anything else is an error
  // we should surface so future API breakage (like the V1→V2 migration) is visible.
  if (data.status !== "1") {
    if (typeof data.result === "string" && data.result !== "No transactions found") {
      console.warn(
        `[ethereum-history] Etherscan error for action=${params.action}: ${data.message ?? ""} — ${data.result}`,
      );
    }
    return [];
  }

  if (!Array.isArray(data.result)) {
    return [];
  }

  return data.result;
}

function normalizeNativeTx(
  tx: EtherscanTx,
  walletAddress: string,
): NormalizedTx | null {
  if (tx.isError === "1") {
    return null;
  }

  const isIncoming =
    tx.to.toLowerCase() === walletAddress.toLowerCase();
  const amount = formatEther(BigInt(tx.value));

  if (amount === "0") {
    return null;
  }

  return {
    txHash: tx.hash,
    fromAddress: tx.from,
    toAddress: tx.to,
    amount,
    tokenSymbol: "ETH",
    tokenAddress: null,
    direction: isIncoming ? "incoming" : "outgoing",
    kind: isIncoming ? "receive" : "send",
    timestamp: new Date(Number(tx.timeStamp) * 1000),
  };
}

function normalizeTokenTx(
  tx: EtherscanTokenTx,
  walletAddress: string,
): NormalizedTx | null {
  const decimals = parseInt(tx.tokenDecimal, 10);
  if (Number.isNaN(decimals)) {
    return null;
  }

  const isIncoming =
    tx.to.toLowerCase() === walletAddress.toLowerCase();
  const amount = formatUnits(BigInt(tx.value), decimals);

  if (amount === "0") {
    return null;
  }

  return {
    txHash: tx.hash,
    fromAddress: tx.from,
    toAddress: tx.to,
    amount,
    tokenSymbol: tx.tokenSymbol || null,
    tokenAddress: tx.contractAddress || null,
    direction: isIncoming ? "incoming" : "outgoing",
    kind: isIncoming ? "receive" : "send",
    timestamp: new Date(Number(tx.timeStamp) * 1000),
  };
}

export async function fetchEthereumHistory(
  walletAddress: string,
  apiKey: string | null,
): Promise<NormalizedTx[]> {
  // V2 requires an API key. Without one, the API returns
  // {"status":"0","result":"Missing/Invalid API Key"} and we cannot sync.
  // Surface this clearly instead of failing silently — that's how the V1
  // deprecation went unnoticed for so long.
  if (!apiKey) {
    console.warn(
      "[ethereum-history] ETHERSCAN_API_KEY is not set — Ethereum transaction history sync is disabled. " +
        "Get a free key at https://etherscan.io/apidashboard.",
    );
    return [];
  }

  try {
    const baseParams: Record<string, string> = {
      chainid: SEPOLIA_CHAIN_ID,
      module: "account",
      address: walletAddress,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: String(MAX_RESULTS),
      sort: "desc",
      apikey: apiKey,
    };

    const [nativeTxs, tokenTxs] = await Promise.all([
      fetchEtherscan<EtherscanTx>({
        ...baseParams,
        action: "txlist",
      }),
      fetchEtherscan<EtherscanTokenTx>({
        ...baseParams,
        action: "tokentx",
      }),
    ]);

    const normalized: NormalizedTx[] = [];

    for (const tx of nativeTxs) {
      const n = normalizeNativeTx(tx, walletAddress);
      if (n) {
        normalized.push(n);
      }
    }

    for (const tx of tokenTxs) {
      const n = normalizeTokenTx(tx, walletAddress);
      if (n) {
        normalized.push(n);
      }
    }

    return normalized;
  } catch (e) {
    console.warn(
      `[ethereum-history] Failed to fetch history for ${walletAddress}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return [];
  }
}
