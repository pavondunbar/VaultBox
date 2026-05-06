import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { sepolia } from "viem/chains";
import { parseHumanAmountToBigInt } from "@/lib/pure/amounts";

export function createEthereumWallet(): {
  address: string;
  /** Hex private key with 0x prefix */
  privateKey: `0x${string}`;
} {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}

export function accountFromPk(privateKeyHex: string) {
  const pk = privateKeyHex.startsWith("0x")
    ? (privateKeyHex as `0x${string}`)
    : (`0x${privateKeyHex}` as `0x${string}`);
  return privateKeyToAccount(pk);
}

export async function getEthNativeBalance(
  rpcUrl: string,
  address: string,
): Promise<{ wei: bigint; formatted: string }> {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const wei = await client.getBalance({
    address: address as Address,
  });
  return { wei, formatted: formatEther(wei) };
}

export async function getErc20Balance(
  rpcUrl: string,
  walletAddress: string,
  tokenAddress: string,
): Promise<{ raw: bigint; decimals: number; formatted: string }> {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const [decimals, raw] = await Promise.all([
    client.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    client.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress as Address],
    }),
  ]);
  return {
    raw,
    decimals,
    formatted: formatUnits(raw, decimals),
  };
}

export async function signEthMessage(
  privateKeyHex: string,
  message: string,
): Promise<string> {
  const account = accountFromPk(privateKeyHex);
  return account.signMessage({ message });
}

export async function sendEthNative(params: {
  rpcUrl: string;
  privateKeyHex: string;
  to: string;
  /** ETH amount as decimal string, e.g. "0.01" */
  amountEth: string;
}): Promise<string> {
  const account = accountFromPk(params.privateKeyHex);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(params.rpcUrl),
  });
  const hash = await walletClient.sendTransaction({
    to: params.to as Address,
    value: parseEther(params.amountEth),
  });
  return hash;
}

export async function sendErc20(params: {
  rpcUrl: string;
  privateKeyHex: string;
  tokenAddress: string;
  to: string;
  /** Human-readable amount, e.g. "10.5" */
  amount: string;
  decimals: number;
}): Promise<string> {
  const account = accountFromPk(params.privateKeyHex);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(params.rpcUrl),
  });
  const value = parseHumanAmountToBigInt(params.amount, params.decimals);

  const hash = await walletClient.writeContract({
    address: params.tokenAddress as Address,
    abi: erc20Abi,
    functionName: "transfer",
    args: [params.to as Address, value],
  });
  return hash;
}

export async function fetchErc20Decimals(
  rpcUrl: string,
  tokenAddress: string,
): Promise<number> {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  return client.readContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: "decimals",
  });
}

export { sepolia };
