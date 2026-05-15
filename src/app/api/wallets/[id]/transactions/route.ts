import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { requireWalletAccess } from "@/lib/wallets/access";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { syncIfStale } from "@/lib/transactions/sync";

export const dynamic = "force-dynamic";

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

  const access = await requireWalletAccess(id, session.id, "viewer");
  if (!access) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }
  const { wallet } = access;

  // Fire sync in background — don't block the response.
  void syncIfStale(wallet);

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.walletId, wallet.id));

  const rows = await db
    .select({
      id: transactions.id,
      txHash: transactions.txHash,
      kind: transactions.kind,
      toAddress: transactions.toAddress,
      fromAddress: transactions.fromAddress,
      direction: transactions.direction,
      chain: transactions.chain,
      amount: transactions.amount,
      status: transactions.status,
      tokenSymbol: transactions.tokenSymbol,
      tokenAddress: transactions.tokenAddress,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.walletId, wallet.id))
    .orderBy(desc(transactions.createdAt))
    .limit(limit)
    .offset(offset);

  const res = NextResponse.json({ transactions: rows, pagination: { total, limit, offset } });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
