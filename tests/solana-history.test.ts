import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const WALLET = "7nYSaEQoJKT8VCZaFmLGqRZbW4fERCmpXJocGMRCMNo5";

const mockGetSignaturesForAddress = vi.fn();
const mockGetParsedTransaction = vi.fn();

vi.mock("@solana/web3.js", async () => {
  const actual = await vi.importActual<
    typeof import("@solana/web3.js")
  >("@solana/web3.js");
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getSignaturesForAddress: mockGetSignaturesForAddress,
      getParsedTransaction: mockGetParsedTransaction,
    })),
  };
});

import { fetchSolanaHistory } from "@/lib/chains/solana-history";

describe("fetchSolanaHistory", () => {
  beforeEach(() => {
    mockGetSignaturesForAddress.mockReset();
    mockGetParsedTransaction.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses incoming SOL system transfer", async () => {
    mockGetSignaturesForAddress.mockResolvedValue([
      { signature: "sig1", err: null },
    ]);

    mockGetParsedTransaction.mockResolvedValue({
      blockTime: 1700000000,
      meta: { err: null },
      transaction: {
        message: {
          instructions: [
            {
              program: "system",
              programId: {},
              parsed: {
                type: "transfer",
                info: {
                  source: "SenderAddr",
                  destination: WALLET,
                  lamports: 1_000_000_000,
                },
              },
            },
          ],
        },
      },
    });

    const result = await fetchSolanaHistory(
      "https://api.devnet.solana.com",
      WALLET,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      txHash: "sig1",
      fromAddress: "SenderAddr",
      toAddress: WALLET,
      amount: "1",
      tokenSymbol: "SOL",
      direction: "incoming",
      kind: "receive",
    });
  });

  it("parses outgoing SOL system transfer", async () => {
    mockGetSignaturesForAddress.mockResolvedValue([
      { signature: "sig2", err: null },
    ]);

    mockGetParsedTransaction.mockResolvedValue({
      blockTime: 1700000000,
      meta: { err: null },
      transaction: {
        message: {
          instructions: [
            {
              program: "system",
              programId: {},
              parsed: {
                type: "transfer",
                info: {
                  source: WALLET,
                  destination: "ReceiverAddr",
                  lamports: 500_000_000,
                },
              },
            },
          ],
        },
      },
    });

    const result = await fetchSolanaHistory(
      "https://api.devnet.solana.com",
      WALLET,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      direction: "outgoing",
      kind: "send",
      amount: "0.5",
    });
  });

  it("skips errored signatures", async () => {
    mockGetSignaturesForAddress.mockResolvedValue([
      { signature: "sig3", err: { InstructionError: [] } },
    ]);

    const result = await fetchSolanaHistory(
      "https://api.devnet.solana.com",
      WALLET,
    );

    expect(result).toHaveLength(0);
    expect(mockGetParsedTransaction).not.toHaveBeenCalled();
  });

  it("skips transactions with meta errors", async () => {
    mockGetSignaturesForAddress.mockResolvedValue([
      { signature: "sig4", err: null },
    ]);

    mockGetParsedTransaction.mockResolvedValue({
      blockTime: 1700000000,
      meta: { err: { InstructionError: [] } },
      transaction: { message: { instructions: [] } },
    });

    const result = await fetchSolanaHistory(
      "https://api.devnet.solana.com",
      WALLET,
    );

    expect(result).toHaveLength(0);
  });

  it("returns empty on RPC failure", async () => {
    mockGetSignaturesForAddress.mockRejectedValue(
      new Error("RPC down"),
    );

    const result = await fetchSolanaHistory(
      "https://api.devnet.solana.com",
      WALLET,
    );

    expect(result).toEqual([]);
  });

  it("skips unparseable instructions", async () => {
    mockGetSignaturesForAddress.mockResolvedValue([
      { signature: "sig5", err: null },
    ]);

    mockGetParsedTransaction.mockResolvedValue({
      blockTime: 1700000000,
      meta: { err: null },
      transaction: {
        message: {
          instructions: [
            { program: "unknown", programId: {} },
          ],
        },
      },
    });

    const result = await fetchSolanaHistory(
      "https://api.devnet.solana.com",
      WALLET,
    );

    expect(result).toHaveLength(0);
  });

  it("returns empty when no signatures found", async () => {
    mockGetSignaturesForAddress.mockResolvedValue([]);

    const result = await fetchSolanaHistory(
      "https://api.devnet.solana.com",
      WALLET,
    );

    expect(result).toEqual([]);
  });
});
