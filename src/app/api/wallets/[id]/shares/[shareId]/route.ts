import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { wallets, walletShares } from "@/lib/db/schema";

const idSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; shareId: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id, shareId } = await context.params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(shareId).success) {
    return NextResponse.json(
      { error: "Invalid id" },
      { status: 400 },
    );
  }

  const [wallet] = await db
    .select({ userId: wallets.userId })
    .from(wallets)
    .where(and(eq(wallets.id, id), eq(wallets.userId, session.id)))
    .limit(1);

  if (!wallet) {
    return NextResponse.json(
      { error: "Wallet not found" },
      { status: 404 },
    );
  }

  const deleted = await db
    .delete(walletShares)
    .where(
      and(
        eq(walletShares.id, shareId),
        eq(walletShares.walletId, id),
      ),
    )
    .returning({ id: walletShares.id });

  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Share not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
