import { describe, expect, it } from "vitest";
import {
  isValidEthAddress,
  isValidSolAddress,
} from "@/lib/validation/addresses";

describe("address validation", () => {
  it("accepts a checksummed Ethereum address", () => {
    expect(
      isValidEthAddress("0xdD870FA1b7C4700F2BD7f4424425Aa6f13f43981"),
    ).toBe(true);
  });

  it("rejects invalid Ethereum addresses", () => {
    expect(isValidEthAddress("0xnothex")).toBe(false);
    expect(isValidEthAddress("")).toBe(false);
  });

  it("accepts a valid Solana base58 address", () => {
    expect(
      isValidSolAddress("83astBRguLMdt2h5U1Tpdq5tjFoJ6noeGwaY3mDLVcri"),
    ).toBe(true);
  });

  it("rejects invalid Solana addresses", () => {
    expect(isValidSolAddress("bad!!!")).toBe(false);
    expect(isValidSolAddress("")).toBe(false);
  });
});
