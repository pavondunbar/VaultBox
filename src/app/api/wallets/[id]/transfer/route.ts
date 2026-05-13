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
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { check, rateLimitResponse } from "@/lib/security/rate-limit";
import { recordLedgerEntries, createDebitCreditPair } from "@/lib/transactions/ledger";
import { acquireWalletLocks } from "@/lib/db/wallet-lock";
import { getOnChainBalance } from "@/lib/wallets/balance";
import { numericGte } from "@/lib/pure/amounts";
import { getCachedResponse, cacheResponse } from "@/lib/security/idempotency";

const idSchema = z.string().uuid();

const bodySchema = z.object({
  toWalletId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  tokenAddress: z.string().optional(),
  mint: z.string().optional(),
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

  const fromAccess = await requireWalletAccess(id, session.id, "editor");
  if (!fromAccess) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }
  const fromWallet = fromAccess.wallet;

  const destAccess = await requireWalletAccess(
    parsed.data.toWalletId,
    session.id,
    "viewer",
  );
  if (!destAccess) {
    return NextResponse.json(
      { error: "Destination wallet not found" },
      { status: 404 },
    );
  }
  const destWallet = destAccess.wallet;

  if (fromWallet.id === destWallet.id) {
    return NextResponse.json(
      { error: "Cannot transfer to the same wallet" },
      { status: 400 },
    );
  }

  if (fromWallet.chain !== destWallet.chain) {
    return NextResponse.json(
      { error: "Wallets must be on the same chain" },
      { status: 400 },
    );
  }

  const { amount, tokenAddress, mint } = parsed.data;
  const to = destWallet.address;

  const env = getServerEnv();
  const secret = unlockWalletKey(fromWallet, env.ENCRYPTION_KEY);

  try {
    const result = await db.transaction(async (tx) => {
      await acquireWalletLocks(tx, [fromWallet.id, destWallet.id]);

      const balance = await getOnChainBalance(
        fromWallet.chain,
        fromWallet.address,
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

      if (fromWallet.chain === "ethereum") {
        if (mint) {
          return {
            error: "mint is only valid for Solana wallets",
            status: 400 as const,
          };
        }
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
          });
          tokenAddrOut = tokenAddress;
          tokenSymbol = "ERC20";
        } else {
          txHash = await sendEthNative({
            rpcUrl: env.ETH_RPC_URL,
            privateKeyHex: secret,
            to,
            amountEth: amount,
          });
        }
      } else if (fromWallet.chain === "bitcoin") {
        if (mint || tokenAddress) {
          return {
            error: "Bitcoin does not support tokens",
            status: 400 as const,
          };
        }
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

      await tx.insert(transactions).values([
        {
          walletId: fromWallet.id,
          chain: fromWallet.chain,
          txHash,
          kind: "transfer",
          toAddress: to,
          fromAddress: fromWallet.address,
          direction: "outgoing",
          amount,
          status: "pending",
          tokenSymbol,
          tokenAddress: tokenAddrOut,
        },
        {
          walletId: destWallet.id,
          chain: destWallet.chain,
          txHash,
          kind: "transfer",
          toAddress: destWallet.address,
          fromAddress: fromWallet.address,
          direction: "incoming",
          amount,
          status: "pending",
          tokenSymbol,
          tokenAddress: tokenAddrOut,
        },
      ]);

      await recordLedgerEntries(
        createDebitCreditPair({
          txHash,
          fromWalletId: fromWallet.id,
          toWalletId: destWallet.id,
          chain: fromWallet.chain,
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
