import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type TransactionReceipt,
  erc20Abi,
} from "viem";
import { sepolia } from "viem/chains";
import { accountFromPk } from "@/lib/chains/ethereum";
import { parseHumanAmountToBigInt } from "@/lib/pure/amounts";

export interface RbfParams {
  rpcUrl: string;
  privateKeyHex: string;
  originalTxHash: string;
  newMaxFeePerGas: bigint;
  newMaxPriorityFeePerGas: bigint;
}

export interface RbfResult {
  replacementTxHash: string;
  nonce: number;
  originalGasPrice: string;
  newGasPrice: string;
  toAddress: string;
  value: string;
}

/**
 * Check if a transaction is still pending (not yet mined).
 */
export async function isTxPending(
  rpcUrl: string,
  txHash: string,
): Promise<boolean> {
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  let receipt: TransactionReceipt | null = null;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch {
    // getTransactionReceipt throws if tx not found or not mined
  }
  return receipt === null;
}

/**
 * Replace a pending Ethereum transaction by resubmitting with the same nonce
 * but higher gas fees (EIP-1559 RBF).
 */
export async function replaceTransaction(params: RbfParams): Promise<RbfResult> {
  const client = createPublicClient({ chain: sepolia, transport: http(params.rpcUrl) });

  const originalTx = await client.getTransaction({
    hash: params.originalTxHash as `0x${string}`,
  });

  if (!originalTx) {
    throw new Error("Original transaction not found");
  }

  const account = accountFromPk(params.privateKeyHex);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(params.rpcUrl),
  });

  const originalGas = originalTx.maxFeePerGas ?? originalTx.gasPrice ?? 0n;

  if (params.newMaxFeePerGas <= originalGas) {
    throw new Error("New gas fee must be higher than original");
  }

  let replacementHash: string;

  if (originalTx.input && originalTx.input !== "0x") {
    // Contract interaction (e.g. ERC-20 transfer) — replay the same calldata
    replacementHash = await walletClient.sendTransaction({
      to: originalTx.to as Address,
      nonce: originalTx.nonce,
      data: originalTx.input,
      value: originalTx.value,
      maxFeePerGas: params.newMaxFeePerGas,
      maxPriorityFeePerGas: params.newMaxPriorityFeePerGas,
    });
  } else {
    // Simple ETH transfer
    replacementHash = await walletClient.sendTransaction({
      to: originalTx.to as Address,
      value: originalTx.value,
      nonce: originalTx.nonce,
      maxFeePerGas: params.newMaxFeePerGas,
      maxPriorityFeePerGas: params.newMaxPriorityFeePerGas,
    });
  }

  return {
    replacementTxHash: replacementHash,
    nonce: originalTx.nonce,
    originalGasPrice: originalGas.toString(),
    newGasPrice: params.newMaxFeePerGas.toString(),
    toAddress: originalTx.to ?? "",
    value: originalTx.value.toString(),
  };
}
