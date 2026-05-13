import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getHotThreshold,
  shouldSweepToCold,
  calculateSweepAmount,
  getColdWalletAddress,
} from "@/lib/wallets/hot-cold";

describe("hot-cold wallet", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getHotThreshold", () => {
    it("returns default threshold for ethereum", () => {
      expect(getHotThreshold("ethereum")).toBe("5");
    });

    it("returns default threshold for solana", () => {
      expect(getHotThreshold("solana")).toBe("100");
    });

    it("returns default threshold for bitcoin", () => {
      expect(getHotThreshold("bitcoin")).toBe("0.5");
    });

    it("uses env override when set", () => {
      vi.stubEnv("ETHEREUM_HOT_THRESHOLD", "10");
      expect(getHotThreshold("ethereum")).toBe("10");
    });
  });

  describe("shouldSweepToCold", () => {
    it("returns false when balance is below threshold", () => {
      expect(shouldSweepToCold("ethereum", "3")).toBe(false);
    });

    it("returns false when balance equals threshold", () => {
      expect(shouldSweepToCold("ethereum", "5")).toBe(false);
    });

    it("returns true when balance exceeds threshold", () => {
      expect(shouldSweepToCold("ethereum", "10")).toBe(true);
    });
  });

  describe("calculateSweepAmount", () => {
    it("returns null when balance is below threshold", () => {
      expect(calculateSweepAmount("ethereum", "3")).toBeNull();
    });

    it("calculates sweep to keep 50% of threshold", () => {
      // Threshold is 5 ETH, balance is 10 ETH
      // Keep 2.5 ETH, sweep 7.5 ETH
      const result = calculateSweepAmount("ethereum", "10");
      expect(result).toBe("7.5");
    });
  });

  describe("getColdWalletAddress", () => {
    it("returns null when not configured", () => {
      expect(getColdWalletAddress("ethereum")).toBeNull();
    });

    it("returns env value when configured", () => {
      vi.stubEnv("ETHEREUM_COLD_WALLET", "0xColdAddress");
      expect(getColdWalletAddress("ethereum")).toBe("0xColdAddress");
    });
  });
});
