import { isAddress } from "viem";
import { PublicKey } from "@solana/web3.js";

export function isValidEthAddress(s: string): boolean {
  return isAddress(s);
}

export function isValidSolAddress(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}
