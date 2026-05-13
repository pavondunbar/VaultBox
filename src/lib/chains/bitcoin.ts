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

// P2WPKH vbyte constants
const OVERHEAD_VBYTES = 10.5; // version + marker + flag + locktime
const INPUT_VBYTES = 68; // per SegWit input (witness discounted)
const OUTPUT_VBYTES = 31; // per P2WPKH output

const DUST_THRESHOLD = 546; // satoshis

const FALLBACK_FEE_RATE = 2; // sat/vB fallback when API unavailable

/**
 * Estimate transaction vsize for P2WPKH inputs/outputs.
 */
export function estimateTxVbytes(inputCount: number, outputCount: number): number {
  return Math.ceil(
    OVERHEAD_VBYTES + inputCount * INPUT_VBYTES + outputCount * OUTPUT_VBYTES,
  );
}

/**
 * Fetch recommended fee rate (sat/vB) from Blockstream Esplora mempool API.
 * Uses the "halfHourFee" target (~3 blocks). Falls back to FALLBACK_FEE_RATE on error.
 */
export async function estimateFeeRate(apiUrl: string): Promise<number> {
  try {
    const res = await fetch(`${apiUrl}/fee-estimates`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return FALLBACK_FEE_RATE;
    const estimates = (await res.json()) as Record<string, number>;
    // Target ~3 blocks confirmation; fall back through priorities
    const rate = estimates["3"] ?? estimates["6"] ?? estimates["1"];
    return rate && rate > 0 ? Math.ceil(rate) : FALLBACK_FEE_RATE;
  } catch {
    return FALLBACK_FEE_RATE;
  }
}

/**
 * Select UTXOs using a largest-first strategy that minimizes inputs while
 * avoiding unnecessary change outputs (exact match within tolerance).
 */
export function selectUtxos(
  utxos: Utxo[],
  target: number,
  feeRate: number,
): { selected: Utxo[]; fee: number } | null {
  if (utxos.length === 0) return null;

  // Sort descending by value for largest-first selection
  const sorted = [...utxos].sort((a, b) => b.value - a.value);

  // Try to find a single UTXO that covers target + fee with no change (within dust)
  for (const u of sorted) {
    const fee = feeRate * estimateTxVbytes(1, 1); // 1 input, 1 output (no change)
    const remainder = u.value - target - fee;
    if (remainder >= 0 && remainder <= DUST_THRESHOLD) {
      return { selected: [u], fee: fee + remainder }; // absorb dust into fee
    }
  }

  // Largest-first accumulation with change output
  const selected: Utxo[] = [];
  let inputSum = 0;
  for (const u of sorted) {
    selected.push(u);
    inputSum += u.value;
    const outputCount = 2; // recipient + change
    const fee = feeRate * estimateTxVbytes(selected.length, outputCount);
    if (inputSum >= target + fee) {
      const change = inputSum - target - fee;
      // If change is dust, absorb it into fee
      if (change > 0 && change <= DUST_THRESHOLD) {
        return { selected, fee: fee + change };
      }
      return { selected, fee };
    }
  }

  // Last resort: check if we can cover with 1 output (no change) using all UTXOs
  const totalFee = feeRate * estimateTxVbytes(selected.length, 1);
  if (inputSum >= target + totalFee) {
    const remainder = inputSum - target - totalFee;
    return { selected, fee: totalFee + remainder };
  }

  return null; // insufficient funds
}

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

  const [utxos, feeRate] = await Promise.all([
    fetchUtxos(apiUrl, address),
    estimateFeeRate(apiUrl),
  ]);

  const result = selectUtxos(utxos, satoshis, feeRate);
  if (!result) throw new Error("Insufficient funds");

  const { selected, fee } = result;
  const inputSum = selected.reduce((s, u) => s + u.value, 0);
  const change = inputSum - satoshis - fee;

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
  if (change > DUST_THRESHOLD) {
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
