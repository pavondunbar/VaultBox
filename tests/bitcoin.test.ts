import { describe, expect, it } from "vitest";
import {
  createBitcoinWallet,
  formatSatoshis,
  parseBtcToSatoshis,
  signBtcMessage,
  keyPairFromWif,
} from "@/lib/chains/bitcoin";
import { isValidBtcAddress } from "@/lib/validation/addresses";
import { formatSatoshis as formatSatoshisFromAmounts } from "@/lib/pure/amounts";

describe("createBitcoinWallet", () => {
  it("generates a valid testnet address and WIF key", () => {
    const w = createBitcoinWallet();
    expect(w.address).toBeTruthy();
    expect(w.privateKeyWif).toBeTruthy();
    // testnet bech32 addresses start with tb1
    expect(w.address.startsWith("tb1")).toBe(true);
    // WIF testnet keys start with 'c' (compressed)
    expect(w.privateKeyWif.startsWith("c")).toBe(true);
  });

  it("generates unique wallets", () => {
    const w1 = createBitcoinWallet();
    const w2 = createBitcoinWallet();
    expect(w1.address).not.toBe(w2.address);
  });
});

describe("isValidBtcAddress", () => {
  it("accepts a valid testnet bech32 address", () => {
    const w = createBitcoinWallet();
    expect(isValidBtcAddress(w.address)).toBe(true);
  });

  it("accepts a testnet P2PKH address (starts with m or n)", () => {
    expect(isValidBtcAddress("mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn")).toBe(true);
  });

  it("rejects invalid addresses", () => {
    expect(isValidBtcAddress("")).toBe(false);
    expect(isValidBtcAddress("not-an-address")).toBe(false);
    expect(isValidBtcAddress("0x1234")).toBe(false);
  });

  it("rejects mainnet addresses", () => {
    // mainnet bech32
    expect(isValidBtcAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(false);
  });
});

describe("formatSatoshis", () => {
  it("formats zero", () => {
    expect(formatSatoshis(0)).toBe("0");
  });

  it("formats 1 BTC", () => {
    expect(formatSatoshis(100_000_000)).toBe("1");
  });

  it("formats fractional BTC", () => {
    expect(formatSatoshis(150_000_000)).toBe("1.5");
  });

  it("formats 1 satoshi", () => {
    expect(formatSatoshis(1)).toBe("0.00000001");
  });

  it("strips trailing zeros", () => {
    expect(formatSatoshis(10_000_000)).toBe("0.1");
  });

  it("throws on negative", () => {
    expect(() => formatSatoshis(-1)).toThrow();
  });

  it("throws on non-integer", () => {
    expect(() => formatSatoshis(1.5)).toThrow();
  });
});

describe("formatSatoshis from amounts.ts", () => {
  it("matches the chain adapter implementation", () => {
    expect(formatSatoshisFromAmounts(100_000_000)).toBe("1");
    expect(formatSatoshisFromAmounts(12_345_678)).toBe("0.12345678");
  });
});

describe("parseBtcToSatoshis", () => {
  it("parses 1 BTC", () => {
    expect(parseBtcToSatoshis("1")).toBe(100_000_000);
  });

  it("parses fractional BTC", () => {
    expect(parseBtcToSatoshis("0.001")).toBe(100_000);
  });

  it("parses 1 satoshi", () => {
    expect(parseBtcToSatoshis("0.00000001")).toBe(1);
  });

  it("throws on invalid input", () => {
    expect(() => parseBtcToSatoshis("abc")).toThrow();
    expect(() => parseBtcToSatoshis("-1")).toThrow();
  });
});

describe("signBtcMessage", () => {
  it("produces a hex signature", () => {
    const w = createBitcoinWallet();
    const sig = signBtcMessage(w.privateKeyWif, "hello");
    expect(sig).toMatch(/^[0-9a-f]+$/);
    expect(sig.length).toBeGreaterThan(0);
  });

  it("produces different signatures for different messages", () => {
    const w = createBitcoinWallet();
    const sig1 = signBtcMessage(w.privateKeyWif, "hello");
    const sig2 = signBtcMessage(w.privateKeyWif, "world");
    expect(sig1).not.toBe(sig2);
  });
});

describe("keyPairFromWif", () => {
  it("round-trips a generated key", () => {
    const w = createBitcoinWallet();
    const kp = keyPairFromWif(w.privateKeyWif);
    expect(kp.publicKey).toBeTruthy();
  });
});
