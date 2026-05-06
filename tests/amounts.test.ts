import { describe, expect, it } from "vitest";
import { parseHumanAmountToBigInt } from "@/lib/pure/amounts";

describe("parseHumanAmountToBigInt", () => {
  it("parses a whole number", () => {
    expect(parseHumanAmountToBigInt("10", 18)).toBe(10n * 10n ** 18n);
  });

  it("parses a decimal fraction", () => {
    expect(parseHumanAmountToBigInt("1.5", 18)).toBe(
      15n * 10n ** 17n,
    );
  });

  it("handles zero decimal places", () => {
    expect(parseHumanAmountToBigInt("42", 0)).toBe(42n);
  });

  it("trims whitespace", () => {
    expect(parseHumanAmountToBigInt("  2  ", 2)).toBe(200n);
  });

  it("pads fractional part to decimals", () => {
    expect(parseHumanAmountToBigInt("0.1", 6)).toBe(100000n);
  });

  it("supports high-precision Ethereum-style amounts", () => {
    const v = parseHumanAmountToBigInt(
      "0.000000000000000001",
      18,
    );
    expect(v).toBe(1n);
  });

  it("throws on invalid characters", () => {
    expect(() => parseHumanAmountToBigInt("1a", 18)).toThrow();
  });

  it("throws on negative-looking input", () => {
    expect(() => parseHumanAmountToBigInt("-1", 18)).toThrow();
  });

  it("throws on invalid decimals", () => {
    expect(() => parseHumanAmountToBigInt("1", -1)).toThrow();
    expect(() => parseHumanAmountToBigInt("1", 1.5)).toThrow();
  });
});
