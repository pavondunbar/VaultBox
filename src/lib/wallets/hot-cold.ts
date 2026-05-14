import { db } from "@/lib/db";
import { wallets, walletTemperature } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { DbContext } from "@/lib/db/types";
import { numericGt, numericSub, numericMulFrac } from "@/lib/pure/amounts";

export type WalletTemp = "hot" | "cold";

export type ThresholdConfig = {
  chain: string;
  /** Balance threshold in human-readable units (e.g. "10" for 10 ETH) */
  hotThreshold: string;
  /** Cold wallet address to sweep excess funds to */
  coldAddress: string;
};

const DEFAULT_THRESHOLDS: Record<string, string> = {
  ethereum: "5",
  solana: "100",
  bitcoin: "0.5",
};

/**
 * Get the temperature classification for a wallet.
 */
export async function getWalletTemperature(
  walletId: string,
  ctx: DbContext = db,
): Promise<WalletTemp> {
  const rows = await ctx
    .select()
    .from(walletTemperature)
    .where(eq(walletTemperature.walletId, walletId))
    .limit(1);
  return (rows[0]?.temperature as WalletTemp) ?? "hot";
}

/**
 * Set a wallet's temperature classification.
 */
export async function setWalletTemperature(
  walletId: string,
  temperature: WalletTemp,
  ctx: DbContext = db,
): Promise<void> {
  await ctx
    .insert(walletTemperature)
    .values({ walletId, temperature })
    .onConflictDoUpdate({
      target: [walletTemperature.walletId],
      set: { temperature, updatedAt: new Date() },
    });
}

/**
 * Check if a wallet is cold (signing disabled for automated operations).
 */
export async function isColdWallet(
  walletId: string,
  ctx: DbContext = db,
): Promise<boolean> {
  return (await getWalletTemperature(walletId, ctx)) === "cold";
}

/**
 * Get the hot threshold for a chain. Returns the max balance a hot wallet
 * should hold before excess is swept to cold storage.
 */
export function getHotThreshold(chain: string): string {
  return process.env[`${chain.toUpperCase()}_HOT_THRESHOLD`] ?? DEFAULT_THRESHOLDS[chain] ?? "1";
}

/**
 * Determine if a hot wallet balance exceeds the threshold and needs sweeping.
 * Uses string-based numeric comparison to avoid floating-point precision issues.
 */
export function shouldSweepToCold(
  chain: string,
  currentBalance: string,
): boolean {
  const threshold = getHotThreshold(chain);
  return numericGt(currentBalance, threshold);
}

/**
 * Get the designated cold wallet address for a chain.
 * Returns null if no cold wallet is configured.
 */
export function getColdWalletAddress(chain: string): string | null {
  return process.env[`${chain.toUpperCase()}_COLD_WALLET`] ?? null;
}

/**
 * Calculate the amount to sweep from hot to cold.
 * Keeps the hot wallet at 50% of threshold after sweep.
 * Uses BigInt arithmetic to avoid floating-point precision loss.
 */
export function calculateSweepAmount(
  chain: string,
  currentBalance: string,
): string | null {
  const threshold = getHotThreshold(chain);
  if (!numericGt(currentBalance, threshold)) return null;
  // keepAmount = threshold * 0.5 = threshold * 1/2
  const keepAmount = numericMulFrac(threshold, 1n, 2n);
  return numericSub(currentBalance, keepAmount);
}

/**
 * Guard: reject automated sends from cold wallets.
 * Cold wallet transactions require manual approval workflow.
 */
export async function requireHotWallet(
  walletId: string,
  ctx: DbContext = db,
): Promise<{ allowed: boolean; reason?: string }> {
  const cold = await isColdWallet(walletId, ctx);
  if (cold) {
    return {
      allowed: false,
      reason: "Cold wallet transactions require manual approval via the withdrawal approval workflow",
    };
  }
  return { allowed: true };
}
