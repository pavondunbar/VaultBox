/**
 * Preset SPL tokens on Solana Devnet.
 * Sources: Circle (USDC), Raydium docs (RAY), Solana native (wSOL).
 * Note: USDT has no official Devnet deployment by Tether — address below is a
 * community-deployed Devnet faucet mint used by multiple DeFi protocols for testing.
 */
export type PresetSplToken = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
};

export const DEVNET_SPL_TOKENS: PresetSplToken[] = [
  { symbol: "USDC", name: "USD Coin", mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", decimals: 6 },
  { symbol: "USDT", name: "Tether USD", mint: "EJwZgeZrdC8TXTQbQBoL6bfuAnFUQS4CFiS2tyVhDDJ8", decimals: 6 },
  { symbol: "RAY", name: "Raydium", mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", decimals: 6 },
  { symbol: "wSOL", name: "Wrapped SOL", mint: "So11111111111111111111111111111111111111112", decimals: 9 },
];
