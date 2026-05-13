const SOL_DECIMALS = 9;
const LAMPORTS_DIVISOR = 10n ** BigInt(SOL_DECIMALS);

const BTC_DECIMALS = 8;
const SATOSHIS_DIVISOR = 10n ** BigInt(BTC_DECIMALS);

/**
 * Format a satoshi count (integer) as a human-readable BTC string.
 */
export function formatSatoshis(satoshis: number): string {
  if (!Number.isInteger(satoshis) || satoshis < 0) {
    throw new Error("satoshis must be a non-negative integer");
  }
  const big = BigInt(satoshis);
  const whole = big / SATOSHIS_DIVISOR;
  const frac = big % SATOSHIS_DIVISOR;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(BTC_DECIMALS, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

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

/**
 * Compare two non-negative decimal strings (e.g. "1.5" vs "0.75").
 * Returns true if `a` is greater than or equal to `b`.
 */
export function numericGte(a: string, b: string): boolean {
  const fracA = a.includes(".") ? a.split(".")[1].length : 0;
  const fracB = b.includes(".") ? b.split(".")[1].length : 0;
  const maxDecimals = Math.max(fracA, fracB);
  const scaledA = parseHumanAmountToBigInt(a, maxDecimals);
  const scaledB = parseHumanAmountToBigInt(b, maxDecimals);
  return scaledA >= scaledB;
}
