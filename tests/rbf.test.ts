import { describe, it, expect, vi } from "vitest";

// Mock viem before importing the module
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(),
    createWalletClient: vi.fn(),
    http: vi.fn(),
  };
});

vi.mock("@/lib/chains/ethereum", () => ({
  accountFromPk: vi.fn(() => ({
    address: "0x1234567890abcdef1234567890abcdef12345678",
  })),
}));

import { createPublicClient, createWalletClient } from "viem";
import { isTxPending, replaceTransaction } from "../src/lib/transactions/rbf";

describe("RBF Module", () => {
  describe("isTxPending", () => {
    it("returns true when transaction has no receipt", async () => {
      const mockGetReceipt = vi.fn().mockRejectedValue(new Error("not found"));
      (createPublicClient as ReturnType<typeof vi.fn>).mockReturnValue({
        getTransactionReceipt: mockGetReceipt,
      });

      const result = await isTxPending("http://rpc", "0xabc");
      expect(result).toBe(true);
    });

    it("returns false when transaction has a receipt", async () => {
      const mockGetReceipt = vi.fn().mockResolvedValue({ status: "success" });
      (createPublicClient as ReturnType<typeof vi.fn>).mockReturnValue({
        getTransactionReceipt: mockGetReceipt,
      });

      const result = await isTxPending("http://rpc", "0xabc");
      expect(result).toBe(false);
    });
  });

  describe("replaceTransaction", () => {
    it("throws if original transaction not found", async () => {
      (createPublicClient as ReturnType<typeof vi.fn>).mockReturnValue({
        getTransaction: vi.fn().mockResolvedValue(null),
      });

      await expect(
        replaceTransaction({
          rpcUrl: "http://rpc",
          privateKeyHex: "0x" + "ab".repeat(32),
          originalTxHash: "0xdeadbeef",
          newMaxFeePerGas: 100n,
          newMaxPriorityFeePerGas: 10n,
        }),
      ).rejects.toThrow("Original transaction not found");
    });

    it("throws if new gas fee is not higher than original", async () => {
      (createPublicClient as ReturnType<typeof vi.fn>).mockReturnValue({
        getTransaction: vi.fn().mockResolvedValue({
          nonce: 5,
          to: "0xrecipient",
          value: 1000000000000000000n,
          input: "0x",
          maxFeePerGas: 200n,
          gasPrice: null,
        }),
      });

      await expect(
        replaceTransaction({
          rpcUrl: "http://rpc",
          privateKeyHex: "0x" + "ab".repeat(32),
          originalTxHash: "0xdeadbeef",
          newMaxFeePerGas: 100n, // lower than original 200n
          newMaxPriorityFeePerGas: 10n,
        }),
      ).rejects.toThrow("New gas fee must be higher than original");
    });

    it("resubmits simple ETH transfer with same nonce and higher gas", async () => {
      const mockSendTransaction = vi.fn().mockResolvedValue("0xnewhash");

      (createPublicClient as ReturnType<typeof vi.fn>).mockReturnValue({
        getTransaction: vi.fn().mockResolvedValue({
          nonce: 5,
          to: "0xrecipient",
          value: 1000000000000000000n,
          input: "0x",
          maxFeePerGas: 50n,
          gasPrice: null,
        }),
      });

      (createWalletClient as ReturnType<typeof vi.fn>).mockReturnValue({
        sendTransaction: mockSendTransaction,
      });

      const result = await replaceTransaction({
        rpcUrl: "http://rpc",
        privateKeyHex: "0x" + "ab".repeat(32),
        originalTxHash: "0xoriginal",
        newMaxFeePerGas: 100n,
        newMaxPriorityFeePerGas: 20n,
      });

      expect(result.replacementTxHash).toBe("0xnewhash");
      expect(result.nonce).toBe(5);
      expect(result.originalGasPrice).toBe("50");
      expect(result.newGasPrice).toBe("100");
      expect(result.toAddress).toBe("0xrecipient");
      expect(result.value).toBe("1000000000000000000");

      expect(mockSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: 5,
          maxFeePerGas: 100n,
          maxPriorityFeePerGas: 20n,
        }),
      );
    });

    it("resubmits contract call with same calldata", async () => {
      const mockSendTransaction = vi.fn().mockResolvedValue("0xnewhash2");
      const contractData = "0xa9059cbb000000000000000000000000abcdef";

      (createPublicClient as ReturnType<typeof vi.fn>).mockReturnValue({
        getTransaction: vi.fn().mockResolvedValue({
          nonce: 10,
          to: "0xtokencontract",
          value: 0n,
          input: contractData,
          maxFeePerGas: 30n,
          gasPrice: null,
        }),
      });

      (createWalletClient as ReturnType<typeof vi.fn>).mockReturnValue({
        sendTransaction: mockSendTransaction,
      });

      const result = await replaceTransaction({
        rpcUrl: "http://rpc",
        privateKeyHex: "0x" + "ab".repeat(32),
        originalTxHash: "0xoriginal",
        newMaxFeePerGas: 60n,
        newMaxPriorityFeePerGas: 15n,
      });

      expect(result.replacementTxHash).toBe("0xnewhash2");
      expect(result.nonce).toBe(10);

      expect(mockSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: 10,
          data: contractData,
          maxFeePerGas: 60n,
          maxPriorityFeePerGas: 15n,
        }),
      );
    });

    it("uses gasPrice when maxFeePerGas is not available", async () => {
      const mockSendTransaction = vi.fn().mockResolvedValue("0xnewhash3");

      (createPublicClient as ReturnType<typeof vi.fn>).mockReturnValue({
        getTransaction: vi.fn().mockResolvedValue({
          nonce: 3,
          to: "0xrecipient",
          value: 500000000000000000n,
          input: "0x",
          maxFeePerGas: null,
          gasPrice: 40n,
        }),
      });

      (createWalletClient as ReturnType<typeof vi.fn>).mockReturnValue({
        sendTransaction: mockSendTransaction,
      });

      const result = await replaceTransaction({
        rpcUrl: "http://rpc",
        privateKeyHex: "0x" + "ab".repeat(32),
        originalTxHash: "0xoriginal",
        newMaxFeePerGas: 80n,
        newMaxPriorityFeePerGas: 10n,
      });

      expect(result.originalGasPrice).toBe("40");
      expect(result.newGasPrice).toBe("80");
    });
  });
});
