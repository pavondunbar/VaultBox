import { describe, expect, it } from "vitest";
import { formatLamports, formatLamportsBigInt, parseHumanAmountToBigInt } from "@/lib/pure/amounts";

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

  it("parses SOL '0.1' with 9 decimals correctly", () => {
    expect(parseHumanAmountToBigInt("0.1", 9)).toBe(100_000_000n);
  });

  it("parses SOL '1.23' with 9 decimals correctly", () => {
    expect(parseHumanAmountToBigInt("1.23", 9)).toBe(1_230_000_000n);
  });
});

describe("formatLamports", () => {
  it("formats zero", () => {
    expect(formatLamports(0)).toBe("0");
  });

  it("formats an exact SOL amount", () => {
    expect(formatLamports(1_000_000_000)).toBe("1");
  });

  it("formats multiple SOL", () => {
    expect(formatLamports(5_000_000_000)).toBe("5");
  });

  it("formats a fractional amount", () => {
    expect(formatLamports(1_500_000_000)).toBe("1.5");
  });

  it("formats 1 lamport", () => {
    expect(formatLamports(1)).toBe("0.000000001");
  });

  it("strips trailing zeros", () => {
    expect(formatLamports(100_000_000)).toBe("0.1");
  });

  it("handles a complex fractional amount", () => {
    expect(formatLamports(1_230_000_000)).toBe("1.23");
  });

  it("throws on negative input", () => {
    expect(() => formatLamports(-1)).toThrow("non-negative integer");
  });

  it("throws on non-integer input", () => {
    expect(() => formatLamports(1.5)).toThrow("non-negative integer");
  });
});

describe("formatLamportsBigInt", () => {
  it("formats zero", () => {
    expect(formatLamportsBigInt(0n)).toBe("0");
  });

  it("formats an exact SOL amount", () => {
    expect(formatLamportsBigInt(1_000_000_000n)).toBe("1");
  });

  it("formats a fractional amount", () => {
    expect(formatLamportsBigInt(1_500_000_000n)).toBe("1.5");
  });

  it("formats 1 lamport", () => {
    expect(formatLamportsBigInt(1n)).toBe("0.000000001");
  });

  it("handles very large values without precision loss", () => {
    // 999,999,999.999999999 SOL
    const lamports = 999_999_999_999_999_999n;
    expect(formatLamportsBigInt(lamports)).toBe("999999999.999999999");
  });

  it("throws on negative input", () => {
    expect(() => formatLamportsBigInt(-1n)).toThrow("non-negative");
  });
});
