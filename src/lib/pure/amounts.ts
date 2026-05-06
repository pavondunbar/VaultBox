const SOL_DECIMALS = 9;
const LAMPORTS_DIVISOR = 10n ** BigInt(SOL_DECIMALS);

/**
 * Format a lamport count (integer) as a human-readable SOL string.
 * Uses BigInt arithmetic to avoid floating-point precision loss.
 */
export function formatLamports(lamports: number): string {
  if (!Number.isInteger(lamports) || lamports < 0) {
    throw new Error("lamports must be a non-negative integer");
  }
  const big = BigInt(lamports);
  const whole = big / LAMPORTS_DIVISOR;
  const frac = big % LAMPORTS_DIVISOR;
  if (frac === 0n) {
    return whole.toString();
  }
  const fracStr = frac
    .toString()
    .padStart(SOL_DECIMALS, "0")
    .replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/**
 * Parse a non-negative decimal string into base units for `decimals` places.
 */
export function parseHumanAmountToBigInt(
  amount: string,
  decimals: number,
): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("Invalid decimals");
  }
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Invalid amount");
  }
  const [wholePart, frac = ""] = trimmed.split(".");
  const whole = wholePart === "" ? "0" : wholePart;
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const scale = 10n ** BigInt(decimals);
  return BigInt(whole) * scale + BigInt(fracPadded || "0");
}
