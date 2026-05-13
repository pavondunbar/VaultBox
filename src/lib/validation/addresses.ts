import { isAddress } from "viem";
import { PublicKey } from "@solana/web3.js";
import * as bitcoin from "bitcoinjs-lib";

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

export function isValidBtcAddress(s: string): boolean {
  try {
    bitcoin.address.toOutputScript(s, bitcoin.networks.testnet);
    return true;
  } catch {
    return false;
  }
}
