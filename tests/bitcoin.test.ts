import { describe, expect, it } from "vitest";
import {
  createBitcoinWallet,
  formatSatoshis,
  parseBtcToSatoshis,
  signBtcMessage,
  keyPairFromWif,
  estimateTxVbytes,
  selectUtxos,
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

describe("estimateTxVbytes", () => {
  it("calculates vbytes for 1 input, 1 output", () => {
    const vbytes = estimateTxVbytes(1, 1);
    // 10.5 + 68 + 31 = 109.5 → 110
    expect(vbytes).toBe(110);
  });

  it("calculates vbytes for 1 input, 2 outputs", () => {
    const vbytes = estimateTxVbytes(1, 2);
    // 10.5 + 68 + 62 = 140.5 → 141
    expect(vbytes).toBe(141);
  });

  it("calculates vbytes for 3 inputs, 2 outputs", () => {
    const vbytes = estimateTxVbytes(3, 2);
    // 10.5 + 204 + 62 = 276.5 → 277
    expect(vbytes).toBe(277);
  });

  it("scales linearly with inputs", () => {
    const v1 = estimateTxVbytes(1, 2);
    const v2 = estimateTxVbytes(2, 2);
    expect(v2 - v1).toBe(68); // INPUT_VBYTES
  });
});

describe("selectUtxos", () => {
  const utxos = [
    { txid: "a", vout: 0, value: 10_000 },
    { txid: "b", vout: 0, value: 50_000 },
    { txid: "c", vout: 0, value: 100_000 },
    { txid: "d", vout: 0, value: 200_000 },
  ];

  it("returns null for empty UTXO set", () => {
    expect(selectUtxos([], 10_000, 2)).toBeNull();
  });

  it("returns null when funds are insufficient", () => {
    const small = [{ txid: "x", vout: 0, value: 100 }];
    expect(selectUtxos(small, 50_000, 2)).toBeNull();
  });

  it("selects the largest UTXO first", () => {
    const result = selectUtxos(utxos, 50_000, 2);
    expect(result).not.toBeNull();
    // Should pick the 200k UTXO (largest) since it covers target + fee
    expect(result!.selected[0].value).toBe(200_000);
  });

  it("uses fewer inputs when possible", () => {
    const result = selectUtxos(utxos, 50_000, 2);
    expect(result).not.toBeNull();
    expect(result!.selected.length).toBe(1);
  });

  it("selects multiple UTXOs when needed", () => {
    const small = [
      { txid: "a", vout: 0, value: 5_000 },
      { txid: "b", vout: 0, value: 5_000 },
      { txid: "c", vout: 0, value: 5_000 },
    ];
    const result = selectUtxos(small, 12_000, 1);
    expect(result).not.toBeNull();
    expect(result!.selected.length).toBeGreaterThan(1);
  });

  it("fee is always positive", () => {
    const result = selectUtxos(utxos, 10_000, 5);
    expect(result).not.toBeNull();
    expect(result!.fee).toBeGreaterThan(0);
  });

  it("absorbs dust into fee (exact match optimization)", () => {
    // Create a UTXO that's just slightly more than target + 1-in/1-out fee
    const feeRate = 2;
    const fee1in1out = feeRate * estimateTxVbytes(1, 1); // 220 sats
    const dustAmount = 300; // less than 546 dust threshold
    const target = 50_000;
    const exactish = [{ txid: "x", vout: 0, value: target + fee1in1out + dustAmount }];
    const result = selectUtxos(exactish, target, feeRate);
    expect(result).not.toBeNull();
    expect(result!.selected.length).toBe(1);
    // Fee should include the absorbed dust
    expect(result!.fee).toBe(fee1in1out + dustAmount);
  });

  it("higher fee rate results in higher fee", () => {
    const lowFee = selectUtxos(utxos, 50_000, 1);
    const highFee = selectUtxos(utxos, 50_000, 10);
    expect(lowFee).not.toBeNull();
    expect(highFee).not.toBeNull();
    expect(highFee!.fee).toBeGreaterThan(lowFee!.fee);
  });
});
