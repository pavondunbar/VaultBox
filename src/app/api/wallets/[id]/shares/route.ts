import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users, wallets, walletShares } from "@/lib/db/schema";
import { check, rateLimitResponse } from "@/lib/security/rate-limit";

const idSchema = z.string().uuid();

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["viewer", "editor"]),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid wallet id" },
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

  const rows = await db
    .select({
      id: walletShares.id,
      email: users.email,
      role: walletShares.role,
      createdAt: walletShares.createdAt,
    })
    .from(walletShares)
    .innerJoin(users, eq(users.id, walletShares.userId))
    .where(eq(walletShares.walletId, id));

  return NextResponse.json({ shares: rows });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid wallet id" },
      { status: 400 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = inviteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const rateResult = await check("share", session.id);
  if (!rateResult.allowed) {
    return rateLimitResponse(rateResult);
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

  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 },
    );
  }

  if (targetUser.id === session.id) {
    return NextResponse.json(
      { error: "Cannot share a wallet with yourself" },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ id: walletShares.id })
    .from(walletShares)
    .where(
      and(
        eq(walletShares.walletId, id),
        eq(walletShares.userId, targetUser.id),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return NextResponse.json(
      { error: "Wallet already shared with this user" },
      { status: 409 },
    );
  }

  const [share] = await db
    .insert(walletShares)
    .values({
      walletId: id,
      userId: targetUser.id,
      role: parsed.data.role,
    })
    .returning({
      id: walletShares.id,
      role: walletShares.role,
      createdAt: walletShares.createdAt,
    });

  return NextResponse.json({
    share: { ...share, email: parsed.data.email },
  });
}
