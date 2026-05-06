import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn(),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn(),
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  transactions: {
    txHash: "tx_hash",
    walletId: "wallet_id",
    direction: "direction",
  },
  wallets: { id: "id" },
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: vi.fn().mockReturnValue({ SOL_RPC_URL: "http://localhost" }),
  getEtherscanApiKey: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/chains/ethereum-history", () => ({
  fetchEthereumHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/chains/solana-history", () => ({
  fetchSolanaHistory: vi.fn().mockResolvedValue([]),
}));

import { isSyncStale } from "@/lib/transactions/sync";

describe("isSyncStale", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true when lastSyncedAt is null", () => {
    expect(isSyncStale(null)).toBe(true);
  });

  it("returns true when lastSyncedAt is older than 2 minutes", () => {
    const threeMinutesAgo = new Date("2025-01-15T11:57:00Z");
    expect(isSyncStale(threeMinutesAgo)).toBe(true);
  });

  it("returns false when lastSyncedAt is within 2 minutes", () => {
    const oneMinuteAgo = new Date("2025-01-15T11:59:00Z");
    expect(isSyncStale(oneMinuteAgo)).toBe(false);
  });

  it("returns false at exactly 2 minutes boundary", () => {
    const exactlyTwoMinutes = new Date("2025-01-15T11:58:00Z");
    expect(isSyncStale(exactlyTwoMinutes)).toBe(false);
  });

  it("returns true just past 2 minutes", () => {
    const justPastTwo = new Date("2025-01-15T11:57:59.999Z");
    expect(isSyncStale(justPastTwo)).toBe(true);
  });

  it("returns false when just synced", () => {
    const now = new Date("2025-01-15T12:00:00Z");
    expect(isSyncStale(now)).toBe(false);
  });
});
