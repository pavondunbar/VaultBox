import { describe, it, expect } from "vitest";
import { createDebitCreditPair } from "../src/lib/transactions/ledger";

describe("Ledger Double-Entry", () => {
  it("creates balanced debit/credit pair", () => {
    const entries = createDebitCreditPair({
      txHash: "0xabc123",
      fromWalletId: "wallet-1",
      toWalletId: "wallet-2",
      chain: "ethereum",
      amount: "1000000000000000000", // 1 ETH in wei
      tokenSymbol: "ETH",
      tokenAddress: null,
    });

    expect(entries).toHaveLength(2);

    const [debit, credit] = entries;

    expect(debit.entryType).toBe("debit");
    expect(debit.walletId).toBe("wallet-1");
    expect(debit.amount).toBe("1000000000000000000");

    expect(credit.entryType).toBe("credit");
    expect(credit.walletId).toBe("wallet-2");
    expect(credit.amount).toBe("1000000000000000000");

    // Verify amounts offset
    expect(BigInt(debit.amount) - BigInt(credit.amount)).toBe(BigInt(0));
  });

  it("creates balanced pair for SPL token transfer", () => {
    const entries = createDebitCreditPair({
      txHash: "sol-tx-hash",
      fromWalletId: "sol-wallet-1",
      toWalletId: "sol-wallet-2",
      chain: "solana",
      amount: "1000000", // 1 USDC (6 decimals)
      tokenSymbol: "USDC",
      tokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    });

    const [debit, credit] = entries;

    expect(debit.tokenSymbol).toBe("USDC");
    expect(debit.tokenAddress).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(credit.tokenSymbol).toBe("USDC");
    expect(credit.tokenAddress).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

    // Verify balanced
    expect(BigInt(debit.amount)).toBe(BigInt(credit.amount));
  });
});
