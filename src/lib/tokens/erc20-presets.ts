/**
 * Preset ERC-20 tokens on Ethereum Sepolia testnet.
 * Sources: Aave V3 Sepolia address book, Chainlink official, Circle official.
 */
export type PresetToken = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
};

export const SEPOLIA_ERC20_TOKENS: PresetToken[] = [
  { symbol: "USDT", name: "Tether USD", address: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0", decimals: 6 },
  { symbol: "USDC", name: "USD Coin", address: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", decimals: 6 },
  { symbol: "DAI", name: "Dai Stablecoin", address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", decimals: 18 },
  { symbol: "WETH", name: "Wrapped Ether", address: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c", decimals: 18 },
  { symbol: "LINK", name: "Chainlink", address: "0x779877A7B0D9E8603169DdbD7836e478b4624789", decimals: 18 },
  { symbol: "UNI", name: "Uniswap", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  { symbol: "AAVE", name: "Aave", address: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a", decimals: 18 },
  { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x29f2D40B0605204364af54EC677bD022dA425d03", decimals: 8 },
];
