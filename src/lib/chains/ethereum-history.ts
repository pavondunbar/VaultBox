import { formatEther, formatUnits } from "viem";
import type { NormalizedTx } from "@/lib/chains/types";

const ETHERSCAN_SEPOLIA_API = "https://api-sepolia.etherscan.io/api";
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
  result: T[] | string;
};

async function fetchEtherscan<T>(
  params: Record<string, string>,
): Promise<T[]> {
  const url = new URL(ETHERSCAN_SEPOLIA_API);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as EtherscanResponse<T>;
  if (data.status !== "1" || !Array.isArray(data.result)) {
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
  try {
    const baseParams: Record<string, string> = {
      module: "account",
      address: walletAddress,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: String(MAX_RESULTS),
      sort: "desc",
    };

    if (apiKey) {
      baseParams.apikey = apiKey;
    }

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
  } catch {
    return [];
  }
}
