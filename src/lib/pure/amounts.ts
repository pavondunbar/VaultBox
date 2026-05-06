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
