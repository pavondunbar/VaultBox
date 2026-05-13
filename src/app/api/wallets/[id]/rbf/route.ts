import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";
import { unlockWalletKey } from "@/lib/wallets/key";
import { requireWalletAccess } from "@/lib/wallets/access";
import { db } from "@/lib/db";
import { rbfTransactions, transactions } from "@/lib/db/schema";
import { check, rateLimitResponse } from "@/lib/security/rate-limit";
import { acquireWalletLock } from "@/lib/db/wallet-lock";
import { isTxPending, replaceTransaction } from "@/lib/transactions/rbf";
import { recordLedgerEntries } from "@/lib/transactions/ledger";

const idSchema = z.string().uuid();

const bodySchema = z.object({
  originalTxHash: z.string().min(1),
  maxFeePerGas: z.string().regex(/^\d+$/),
  maxPriorityFeePerGas: z.string().regex(/^\d+$/),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid wallet id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const rateResult = check("send", session.id);
  if (!rateResult.allowed) {
    return rateLimitResponse(rateResult);
  }

  const access = await requireWalletAccess(id, session.id, "editor");
  if (!access) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }
  const { wallet } = access;

  if (wallet.chain !== "ethereum") {
    return NextResponse.json(
      { error: "RBF is only supported for Ethereum wallets" },
      { status: 400 },
    );
  }

  const { originalTxHash, maxFeePerGas, maxPriorityFeePerGas } = parsed.data;
  const env = getServerEnv();

  const pending = await isTxPending(env.ETH_RPC_URL, originalTxHash);
  if (!pending) {
    return NextResponse.json(
      { error: "Transaction is already confirmed and cannot be replaced" },
      { status: 409 },
    );
  }

  const secret = unlockWalletKey(wallet, env.ENCRYPTION_KEY);

  try {
    const result = await db.transaction(async (tx) => {
      await acquireWalletLock(tx, wallet.id);

      const rbfResult = await replaceTransaction({
        rpcUrl: env.ETH_RPC_URL,
        privateKeyHex: secret,
        originalTxHash,
        newMaxFeePerGas: BigInt(maxFeePerGas),
        newMaxPriorityFeePerGas: BigInt(maxPriorityFeePerGas),
      });

      // Record the replacement in rbf_transactions table
      await tx.insert(rbfTransactions).values({
        walletId: wallet.id,
        originalTxHash,
        replacementTxHash: rbfResult.replacementTxHash,
        nonce: rbfResult.nonce.toString(),
        originalGasPrice: rbfResult.originalGasPrice,
        newGasPrice: rbfResult.newGasPrice,
        toAddress: rbfResult.toAddress,
        amount: rbfResult.value,
        tokenAddress: null,
        status: "pending",
      });

      // Also record in the transactions table for full audit trail
      await tx.insert(transactions).values({
        walletId: wallet.id,
        chain: "ethereum",
        txHash: rbfResult.replacementTxHash,
        kind: "send",
        toAddress: rbfResult.toAddress,
        fromAddress: wallet.address,
        direction: "outgoing",
        amount: rbfResult.value,
        tokenSymbol: null,
        tokenAddress: null,
      });

      // Record ledger debit for the replacement tx
      await recordLedgerEntries(
        [
          {
            txHash: rbfResult.replacementTxHash,
            walletId: wallet.id,
            chain: "ethereum",
            entryType: "debit",
            amount: rbfResult.value,
            tokenSymbol: null,
            tokenAddress: null,
          },
        ],
        tx,
      );

      return rbfResult;
    });

    return NextResponse.json({
      replacementTxHash: result.replacementTxHash,
      nonce: result.nonce,
      originalGasPrice: result.originalGasPrice,
      newGasPrice: result.newGasPrice,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "RBF transaction failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
