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
import { getWalletForUser } from "@/lib/wallets/access";
import { isValidEthAddress, isValidSolAddress } from "@/lib/validation/addresses";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";

const idSchema = z.string().uuid();

const bodySchema = z.object({
  to: z.string().min(1),
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

  const wallet = await getWalletForUser(id, session.id);
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const { to, amount, tokenAddress, mint } = parsed.data;

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
    let txHash: string;
    let tokenSymbol: string | null = null;
    let tokenAddrOut: string | null = null;

    if (wallet.chain === "ethereum") {
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

    await db.insert(transactions).values({
      walletId: wallet.id,
      chain: wallet.chain,
      txHash,
      kind: "send",
      toAddress: to,
      amount,
      tokenSymbol,
      tokenAddress: tokenAddrOut,
    });

    return NextResponse.json({ transactionHash: txHash });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transaction failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
