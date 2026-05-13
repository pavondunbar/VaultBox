import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getMint,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { formatLamportsBigInt, parseHumanAmountToBigInt } from "@/lib/pure/amounts";

export function createSolanaWallet(): {
  address: string;
  /** bs58-encoded full secret key bytes */
  secretBs58: string;
} {
  const kp = Keypair.generate();
  return {
    address: kp.publicKey.toBase58(),
    secretBs58: bs58.encode(kp.secretKey),
  };
}

export function keypairFromSecret(secretBs58: string): Keypair {
  const secret = bs58.decode(secretBs58);
  return Keypair.fromSecretKey(secret);
}

export async function getSolNativeBalance(
  rpcUrl: string,
  address: string,
): Promise<{ lamports: bigint; formatted: string }> {
  const conn = new Connection(rpcUrl, "confirmed");
  const pk = new PublicKey(address);
  const lamportsNum = await conn.getBalance(pk);
  const lamports = BigInt(lamportsNum);
  return {
    lamports,
    formatted: formatLamportsBigInt(lamports),
  };
}

export async function getSplBalance(
  rpcUrl: string,
  walletAddress: string,
  mintAddress: string,
): Promise<{ raw: bigint; decimals: number; formatted: string }> {
  const conn = new Connection(rpcUrl, "confirmed");
  const owner = new PublicKey(walletAddress);
  const mint = new PublicKey(mintAddress);
  const mintInfo = await getMint(conn, mint);
  const decimals = mintInfo.decimals;
  const ata = await getAssociatedTokenAddress(mint, owner);
  try {
    const acc = await getAccount(conn, ata);
    const raw = BigInt(acc.amount.toString());
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    const formatted =
      decimals === 0
        ? whole.toString()
        : `${whole}.${frac
            .toString()
            .padStart(decimals, "0")
            .replace(/0+$/, "") || "0"}`;
    return { raw, decimals, formatted };
  } catch {
    return { raw: 0n, decimals, formatted: "0" };
  }
}

export function signSolanaMessage(secretBs58: string, message: string): string {
  const kp = keypairFromSecret(secretBs58);
  const msgBytes = new TextEncoder().encode(message);
  const sig = nacl.sign.detached(msgBytes, kp.secretKey);
  return bs58.encode(sig);
}

export async function sendSolNative(params: {
  rpcUrl: string;
  secretBs58: string;
  to: string;
  /** SOL as decimal string */
  amountSol: string;
}): Promise<string> {
  const conn = new Connection(params.rpcUrl, "confirmed");
  const from = keypairFromSecret(params.secretBs58);
  const to = new PublicKey(params.to);
  const lamports = parseHumanAmountToBigInt(params.amountSol, 9);
  if (lamports <= 0n) {
    throw new Error("Invalid SOL amount");
  }
  const ix = SystemProgram.transfer({
    fromPubkey: from.publicKey,
    toPubkey: to,
    lamports,
  });
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [from]);
  return sig;
}

export async function sendSplToken(params: {
  rpcUrl: string;
  secretBs58: string;
  mint: string;
  toOwnerAddress: string;
  /** Human amount */
  amount: string;
  decimals: number;
}): Promise<string> {
  const conn = new Connection(params.rpcUrl, "confirmed");
  const owner = keypairFromSecret(params.secretBs58);
  const mint = new PublicKey(params.mint);
  const destOwner = new PublicKey(params.toOwnerAddress);

  const fromAta = await getAssociatedTokenAddress(mint, owner.publicKey);
  const toAta = await getAssociatedTokenAddress(mint, destOwner);

  const rawAmount = parseHumanAmountToBigInt(params.amount, params.decimals);
  if (rawAmount <= 0n) {
    throw new Error("Invalid token amount");
  }

  const tx = new Transaction();

  const toInfo = await conn.getAccountInfo(toAta);
  if (!toInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        owner.publicKey,
        toAta,
        destOwner,
        mint,
      ),
    );
  }

  tx.add(
    createTransferInstruction(
      fromAta,
      toAta,
      owner.publicKey,
      rawAmount,
    ),
  );

  const sig = await sendAndConfirmTransaction(conn, tx, [owner]);
  return sig;
}

export async function fetchSplDecimals(
  rpcUrl: string,
  mint: string,
): Promise<number> {
  const conn = new Connection(rpcUrl, "confirmed");
  const m = await getMint(conn, new PublicKey(mint));
  return m.decimals;
}
