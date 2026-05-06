export type ChainId = "ethereum" | "solana";

export type NormalizedTx = {
  txHash: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  tokenSymbol: string | null;
  tokenAddress: string | null;
  direction: "incoming" | "outgoing";
  kind: "send" | "receive" | "transfer";
  timestamp: Date;
};
