import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import ECPairFactory from "ecpair";

const ECPair = ECPairFactory(ecc);

const testnet = bitcoin.networks.testnet;

export function createBitcoinWallet(): {
  address: string;
  /** WIF-encoded private key (testnet) */
  privateKeyWif: string;
} {
  const keyPair = ECPair.makeRandom({ network: testnet });
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: testnet,
  });
  if (!address) {
    throw new Error("Failed to derive Bitcoin testnet address");
  }
  return { address, privateKeyWif: keyPair.toWIF() };
}

export function keyPairFromWif(wif: string) {
  return ECPair.fromWIF(wif, testnet);
}

type Utxo = {
  txid: string;
  vout: number;
  value: number;
};

async function fetchUtxos(apiUrl: string, address: string): Promise<Utxo[]> {
  const res = await fetch(`${apiUrl}/address/${address}/utxo`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  return (await res.json()) as Utxo[];
}

async function fetchRawTx(apiUrl: string, txid: string): Promise<Buffer> {
  const res = await fetch(`${apiUrl}/tx/${txid}/hex`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Failed to fetch tx ${txid}`);
  const hex = await res.text();
  return Buffer.from(hex, "hex");
}

export async function getBtcBalance(
  apiUrl: string,
  address: string,
): Promise<{ satoshis: number; formatted: string }> {
  const utxos = await fetchUtxos(apiUrl, address);
  const satoshis = utxos.reduce((sum, u) => sum + u.value, 0);
  return { satoshis, formatted: formatSatoshis(satoshis) };
}

export function signBtcMessage(wif: string, message: string): string {
  const keyPair = keyPairFromWif(wif);
  const msgHash = bitcoin.crypto.sha256(Buffer.from(message));
  const sig = keyPair.sign(msgHash);
  return sig.toString("hex");
}

export async function sendBtcNative(params: {
  apiUrl: string;
  privateKeyWif: string;
  to: string;
  /** BTC as decimal string, e.g. "0.001" */
  amountBtc: string;
}): Promise<string> {
  const { apiUrl, privateKeyWif, to, amountBtc } = params;
  const keyPair = keyPairFromWif(privateKeyWif);
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: testnet,
  });
  if (!address) throw new Error("Cannot derive sender address");

  const satoshis = parseBtcToSatoshis(amountBtc);
  if (satoshis <= 0) throw new Error("Invalid BTC amount");

  const utxos = await fetchUtxos(apiUrl, address);
  const FEE = 1000; // fixed fee in satoshis for testnet
  const needed = satoshis + FEE;

  let inputSum = 0;
  const selected: Utxo[] = [];
  for (const u of utxos) {
    selected.push(u);
    inputSum += u.value;
    if (inputSum >= needed) break;
  }
  if (inputSum < needed) throw new Error("Insufficient funds");

  const psbt = new bitcoin.Psbt({ network: testnet });

  for (const utxo of selected) {
    const rawTx = await fetchRawTx(apiUrl, utxo.txid);
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      nonWitnessUtxo: rawTx,
    });
  }

  psbt.addOutput({ address: to, value: satoshis });
  const change = inputSum - satoshis - FEE;
  if (change > 546) {
    psbt.addOutput({ address, value: change });
  }

  for (let i = 0; i < selected.length; i++) {
    psbt.signInput(i, keyPair);
  }
  psbt.finalizeAllInputs();

  const txHex = psbt.extractTransaction().toHex();

  const broadcastRes = await fetch(`${apiUrl}/tx`, {
    method: "POST",
    body: txHex,
    signal: AbortSignal.timeout(10_000),
  });
  if (!broadcastRes.ok) {
    const err = await broadcastRes.text();
    throw new Error(`Broadcast failed: ${err}`);
  }
  return await broadcastRes.text();
}

const BTC_DECIMALS = 8;
const SATOSHIS_DIVISOR = 10n ** BigInt(BTC_DECIMALS);

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

export function parseBtcToSatoshis(amount: string): number {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Invalid amount");
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "00000000").slice(0, 8);
  return Number(BigInt(whole) * SATOSHIS_DIVISOR + BigInt(fracPadded));
}
