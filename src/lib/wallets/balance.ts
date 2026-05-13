import {
  getEthNativeBalance,
  getErc20Balance,
} from "@/lib/chains/ethereum";
import {
  getSolNativeBalance,
  getSplBalance,
} from "@/lib/chains/solana";
import { getBtcBalance } from "@/lib/chains/bitcoin";

/**
 * Fetch the live on-chain balance for a wallet.
 * Returns a human-readable decimal string (e.g. "1.5").
 */
export async function getOnChainBalance(
  chain: string,
  address: string,
  ethRpcUrl: string,
  solRpcUrl: string,
  tokenAddress: string | null,
): Promise<string> {
  if (chain === "ethereum") {
    if (tokenAddress) {
      const { formatted } = await getErc20Balance(ethRpcUrl, address, tokenAddress);
      return formatted;
    }
    const { formatted } = await getEthNativeBalance(ethRpcUrl, address);
    return formatted;
  }
  if (chain === "bitcoin") {
    const btcApiUrl = process.env.BTC_API_URL ?? "https://blockstream.info/testnet/api";
    const { formatted } = await getBtcBalance(btcApiUrl, address);
    return formatted;
  }
  // solana
  if (tokenAddress) {
    const { formatted } = await getSplBalance(solRpcUrl, address, tokenAddress);
    return formatted;
  }
  const { formatted } = await getSolNativeBalance(solRpcUrl, address);
  return formatted;
}
