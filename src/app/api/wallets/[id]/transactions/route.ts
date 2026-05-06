import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { getWalletForUser } from "@/lib/wallets/access";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";

const idSchema = z.string().uuid();

export async function GET(
  _request: Request,
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
      tokenSymbol: transactions.tokenSymbol,
      tokenAddress: transactions.tokenAddress,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.walletId, wallet.id))
    .orderBy(desc(transactions.createdAt))
    .limit(100);

  return NextResponse.json({ transactions: rows });
}
