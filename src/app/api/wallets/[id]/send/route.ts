import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";
import {
  fetchErc20Decimals,
  sendErc20,
  sendEthNative,
} from "@/lib/chains/ethereum";
import {
  fetchSplDecimals,
  sendSolNative,
  sendSplToken,
} from "@/lib/chains/solana";
import { sendBtcNative } from "@/lib/chains/bitcoin";
import { unlockWalletKey } from "@/lib/wallets/key";
import { requireWalletAccess } from "@/lib/wallets/access";
import { isValidEthAddress, isValidSolAddress, isValidBtcAddress } from "@/lib/validation/addresses";
import { db } from "@/lib/db";
import { transactions, wallets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { check, rateLimitResponse } from "@/lib/security/rate-limit";
import { recordLedgerEntries, createDebitCreditPair } from "@/lib/transactions/ledger";
import { acquireWalletLock } from "@/lib/db/wallet-lock";
import { getOnChainBalance } from "@/lib/wallets/balance";
import { numericGte } from "@/lib/pure/amounts";
import { getCachedResponse, cacheResponse } from "@/lib/security/idempotency";

const idSchema = z.string().uuid();

const bodySchema = z.object({
  to: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  tokenAddress: z.string().optional(),
  mint: z.string().optional(),
  gasPrice: z.string().regex(/^\d+(\.\d+)?$/).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Idempotency key support
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const cached = await getCachedResponse(idempotencyKey, session.id);
    if (cached) return cached;
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

  const { to, amount, tokenAddress, mint, gasPrice } = parsed.data;

  if (wallet.chain === "ethereum") {
    if (mint) {
      return NextResponse.json(
        { error: "mint is only valid for Solana wallets" },
        { status: 400 },
      );
    }
    if (!isValidEthAddress(to)) {
      return NextResponse.json({ error: "Invalid Ethereum address" }, { status: 400 });
    }
  } else if (wallet.chain === "bitcoin") {
    if (mint || tokenAddress) {
      return NextResponse.json(
        { error: "Bitcoin does not support tokens" },
        { status: 400 },
      );
    }
    if (!isValidBtcAddress(to)) {
      return NextResponse.json({ error: "Invalid Bitcoin address" }, { status: 400 });
    }
  } else {
    if (tokenAddress) {
      return NextResponse.json(
        { error: "tokenAddress is only valid for Ethereum wallets" },
        { status: 400 },
      );
    }
    if (!isValidSolAddress(to)) {
      return NextResponse.json({ error: "Invalid Solana address" }, { status: 400 });
    }
  }

  const env = getServerEnv();
  const secret = unlockWalletKey(wallet, env.ENCRYPTION_KEY);

  try {
    const result = await db.transaction(async (tx) => {
      await acquireWalletLock(tx, wallet.id);

      const balance = await getOnChainBalance(
        wallet.chain,
        wallet.address,
        env.ETH_RPC_URL,
        env.SOL_RPC_URL,
        tokenAddress ?? mint ?? null,
      );
      if (!numericGte(balance, amount)) {
        return { error: "Insufficient funds", status: 400 as const };
      }

      let txHash: string;
      let tokenSymbol: string | null = null;
      let tokenAddrOut: string | null = null;

      if (wallet.chain === "ethereum") {
        if (tokenAddress) {
          const decimals = await fetchErc20Decimals(
            env.ETH_RPC_URL,
            tokenAddress,
          );
          txHash = await sendErc20({
            rpcUrl: env.ETH_RPC_URL,
            privateKeyHex: secret,
            tokenAddress,
            to,
            amount,
            decimals,
            gasPriceGwei: gasPrice,
          });
          tokenAddrOut = tokenAddress;
          tokenSymbol = "ERC20";
        } else {
          txHash = await sendEthNative({
            rpcUrl: env.ETH_RPC_URL,
            privateKeyHex: secret,
            to,
            amountEth: amount,
            gasPriceGwei: gasPrice,
          });
        }
      } else if (wallet.chain === "bitcoin") {
        txHash = await sendBtcNative({
          apiUrl: env.BTC_API_URL,
          privateKeyWif: secret,
          to,
          amountBtc: amount,
        });
      } else if (mint) {
        const decimals = await fetchSplDecimals(env.SOL_RPC_URL, mint);
        txHash = await sendSplToken({
          rpcUrl: env.SOL_RPC_URL,
          secretBs58: secret,
          mint,
          toOwnerAddress: to,
          amount,
          decimals,
        });
        tokenAddrOut = mint;
        tokenSymbol = "SPL";
      } else {
        txHash = await sendSolNative({
          rpcUrl: env.SOL_RPC_URL,
          secretBs58: secret,
          to,
          amountSol: amount,
        });
      }

      await tx.insert(transactions).values({
        walletId: wallet.id,
        chain: wallet.chain,
        txHash,
        kind: "send",
        toAddress: to,
        fromAddress: wallet.address,
        direction: "outgoing",
        amount,
        status: "pending",
        tokenSymbol,
        tokenAddress: tokenAddrOut,
      });

      const recipientWallet = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.address, to))
        .limit(1);

      const creditWalletId =
        recipientWallet.length > 0 ? recipientWallet[0].id : wallet.id;

      await recordLedgerEntries(
        createDebitCreditPair({
          txHash,
          fromWalletId: wallet.id,
          toWalletId: creditWalletId,
          chain: wallet.chain,
          amount,
          tokenSymbol,
          tokenAddress: tokenAddrOut,
        }),
        tx,
      );

      return { transactionHash: txHash };
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    if (idempotencyKey) {
      await cacheResponse(idempotencyKey, session.id, result, 200);
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transaction failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
