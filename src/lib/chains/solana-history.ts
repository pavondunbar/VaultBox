import {
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { formatLamports } from "@/lib/pure/amounts";
import type { NormalizedTx } from "@/lib/chains/types";

const MAX_SIGNATURES = 20;

type ParsedInstruction = {
  program: string;
  programId: PublicKey;
  parsed?: {
    type: string;
    info: Record<string, unknown>;
  };
};

function parseSystemTransfer(
  ix: ParsedInstruction,
  walletAddress: string,
  timestamp: Date,
): NormalizedTx | null {
  if (ix.program !== "system") {
    return null;
  }

  const info = ix.parsed?.info;
  if (!info || ix.parsed?.type !== "transfer") {
    return null;
  }

  const source = info.source as string;
  const destination = info.destination as string;
  const lamports = info.lamports as number;

  if (!source || !destination || !lamports) {
    return null;
  }

  const isIncoming = destination === walletAddress;
  const amount = formatLamports(lamports);

  return {
    txHash: "",
    fromAddress: source,
    toAddress: destination,
    amount,
    tokenSymbol: "SOL",
    tokenAddress: null,
    direction: isIncoming ? "incoming" : "outgoing",
    kind: isIncoming ? "receive" : "send",
    timestamp,
  };
}

function parseSplTransfer(
  ix: ParsedInstruction,
  walletAddress: string,
  timestamp: Date,
): NormalizedTx | null {
  if (ix.program !== "spl-token") {
    return null;
  }

  const parsed = ix.parsed;
  if (!parsed) {
    return null;
  }

  const { type, info } = parsed;
  if (type !== "transfer" && type !== "transferChecked") {
    return null;
  }

  const authority = info.authority as string | undefined;
  const source = info.source as string | undefined;
  const destination = info.destination as string | undefined;
  const mint = info.mint as string | undefined;

  const sender = authority ?? source ?? "";
  const receiver = destination ?? "";

  if (!sender || !receiver) {
    return null;
  }

  let amount: string;
  if (type === "transferChecked" && info.tokenAmount) {
    const tokenAmount = info.tokenAmount as {
      uiAmountString?: string;
    };
    amount = tokenAmount.uiAmountString ?? "0";
  } else {
    amount = String(info.amount ?? "0");
  }

  const isIncoming =
    receiver === walletAddress || authority !== walletAddress;

  return {
    txHash: "",
    fromAddress: sender,
    toAddress: receiver,
    amount,
    tokenSymbol: null,
    tokenAddress: mint ?? null,
    direction: isIncoming ? "incoming" : "outgoing",
    kind: isIncoming ? "receive" : "send",
    timestamp,
  };
}

export async function fetchSolanaHistory(
  rpcUrl: string,
  walletAddress: string,
): Promise<NormalizedTx[]> {
  try {
    const conn = new Connection(rpcUrl, "confirmed");
    const pubkey = new PublicKey(walletAddress);

    const signatures = await conn.getSignaturesForAddress(pubkey, {
      limit: MAX_SIGNATURES,
    });

    const normalized: NormalizedTx[] = [];

    for (const sigInfo of signatures) {
      if (sigInfo.err) {
        continue;
      }

      try {
        const tx = await conn.getParsedTransaction(
          sigInfo.signature,
          { maxSupportedTransactionVersion: 0 },
        );

        if (!tx?.meta || tx.meta.err) {
          continue;
        }

        const blockTime = tx.blockTime
          ? new Date(tx.blockTime * 1000)
          : new Date();

        const instructions =
          tx.transaction.message.instructions as ParsedInstruction[];

        for (const ix of instructions) {
          if (!ix.parsed) {
            continue;
          }

          const systemTx = parseSystemTransfer(
            ix,
            walletAddress,
            blockTime,
          );
          if (systemTx) {
            systemTx.txHash = sigInfo.signature;
            normalized.push(systemTx);
            continue;
          }

          const splTx = parseSplTransfer(
            ix,
            walletAddress,
            blockTime,
          );
          if (splTx) {
            splTx.txHash = sigInfo.signature;
            normalized.push(splTx);
          }
        }
      } catch {
        continue;
      }
    }

    return normalized;
  } catch {
    return [];
  }
}
