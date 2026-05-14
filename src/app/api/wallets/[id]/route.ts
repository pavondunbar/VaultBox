import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { requireWalletAccess } from "@/lib/wallets/access";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { getOnChainBalance } from "@/lib/wallets/balance";
import { getServerEnv } from "@/lib/env";

const idSchema = z.string().uuid();
const patchSchema = z.object({ label: z.string().min(1).max(100) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid wallet id" }, { status: 400 });

  const access = await requireWalletAccess(id, session.id, "owner");
  if (!access) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "label is required (1-100 chars)" }, { status: 400 });

  await db.update(wallets).set({ label: parsed.data.label }).where(eq(wallets.id, id));
  return NextResponse.json({ success: true, label: parsed.data.label });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid wallet id" }, { status: 400 });

  const access = await requireWalletAccess(id, session.id, "owner");
  if (!access) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  if (!force) {
    const env = getServerEnv();
    const { wallet } = access;
    const symbol = wallet.chain === "ethereum" ? "ETH" : wallet.chain === "solana" ? "SOL" : "BTC";

    try {
      const balance = await getOnChainBalance(wallet.chain, wallet.address, env.ETH_RPC_URL, env.SOL_RPC_URL, null);
      if (parseFloat(balance) > 0) {
        return NextResponse.json({ warning: `Wallet still has ${balance} ${symbol}. Remaining funds will be lost permanently.`, requiresConfirm: true }, { status: 409 });
      }
    } catch {
      // If balance check fails, proceed with deletion
    }
  }

  await db.delete(wallets).where(eq(wallets.id, id));
  return NextResponse.json({ success: true });
}
