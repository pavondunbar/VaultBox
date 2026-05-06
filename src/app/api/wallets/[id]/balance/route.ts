import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";
import { getErc20Balance, getEthNativeBalance } from "@/lib/chains/ethereum";
import { getSolNativeBalance, getSplBalance } from "@/lib/chains/solana";
import { getWalletForUser } from "@/lib/wallets/access";

const idSchema = z.string().uuid();

export async function GET(
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

  const wallet = await getWalletForUser(id, session.id);
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const env = getServerEnv();
  const url = new URL(request.url);
  const tokenAddress = url.searchParams.get("token");
  const mint = url.searchParams.get("mint");

  try {
    if (wallet.chain === "ethereum") {
      if (tokenAddress) {
        const b = await getErc20Balance(
          env.ETH_RPC_URL,
          wallet.address,
          tokenAddress,
        );
        return NextResponse.json({
          chain: "ethereum",
          asset: "token",
          tokenAddress,
          balance: b.formatted,
          raw: b.raw.toString(),
          decimals: b.decimals,
        });
      }
      const b = await getEthNativeBalance(env.ETH_RPC_URL, wallet.address);
      return NextResponse.json({
        chain: "ethereum",
        asset: "native",
        symbol: "ETH",
        balance: b.formatted,
        wei: b.wei.toString(),
      });
    }

    if (mint) {
      const b = await getSplBalance(env.SOL_RPC_URL, wallet.address, mint);
      return NextResponse.json({
        chain: "solana",
        asset: "token",
        mint,
        balance: b.formatted,
        raw: b.raw.toString(),
        decimals: b.decimals,
      });
    }

    const b = await getSolNativeBalance(env.SOL_RPC_URL, wallet.address);
    return NextResponse.json({
      chain: "solana",
      asset: "native",
      symbol: "SOL",
      balance: b.formatted,
      lamports: b.lamports,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load balance";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
