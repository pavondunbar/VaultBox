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
import { unlockWalletKey } from "@/lib/wallets/key";
import { requireWalletAccess } from "@/lib/wallets/access";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { check, rateLimitResponse } from "@/lib/security/rate-limit";
import { recordLedgerEntries, createDebitCreditPair } from "@/lib/transactions/ledger";

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
    let txHash: string;
    let tokenSymbol: string | null = null;
    let tokenAddrOut: string | null = null;

    if (fromWallet.chain === "ethereum") {
      if (mint) {
        return NextResponse.json(
          { error: "mint is only valid for Solana wallets" },
          { status: 400 },
        );
      }
      if (tokenAddress) {
        const decimals = await fetchErc20Decimals(env.ETH_RPC_URL, tokenAddress);
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

    await db.insert(transactions).values([
      {
        walletId: fromWallet.id,
        chain: fromWallet.chain,
        txHash,
        kind: "transfer",
        toAddress: to,
        fromAddress: fromWallet.address,
        direction: "outgoing",
        amount,
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
    );

    return NextResponse.json({ transactionHash: txHash });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transaction failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
