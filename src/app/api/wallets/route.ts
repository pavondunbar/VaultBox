import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";
import { encryptSecret } from "@/lib/crypto/vault";
import { createEthereumWallet } from "@/lib/chains/ethereum";
import { createSolanaWallet } from "@/lib/chains/solana";
import { createBitcoinWallet } from "@/lib/chains/bitcoin";
import { db } from "@/lib/db";
import { users, wallets, walletShares, walletTemperature } from "@/lib/db/schema";
import { check, rateLimitResponse } from "@/lib/security/rate-limit";
import { withMetrics } from "@/lib/monitoring/instrument";

const createSchema = z.object({
  chain: z.enum(["ethereum", "solana", "bitcoin"]),
  label: z.string().max(64).optional(),
});

export const GET = withMetrics(async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const owned = await db
    .select({
      id: wallets.id,
      chain: wallets.chain,
      address: wallets.address,
      label: wallets.label,
      createdAt: wallets.createdAt,
      temperature: walletTemperature.temperature,
    })
    .from(wallets)
    .leftJoin(walletTemperature, eq(walletTemperature.walletId, wallets.id))
    .where(eq(wallets.userId, session.id))
    .orderBy(desc(wallets.createdAt));

  const shared = await db
    .select({
      id: wallets.id,
      chain: wallets.chain,
      address: wallets.address,
      label: wallets.label,
      createdAt: wallets.createdAt,
      role: walletShares.role,
      temperature: walletTemperature.temperature,
    })
    .from(walletShares)
    .innerJoin(wallets, eq(wallets.id, walletShares.walletId))
    .leftJoin(walletTemperature, eq(walletTemperature.walletId, wallets.id))
    .where(eq(walletShares.userId, session.id))
    .orderBy(desc(wallets.createdAt));

  const all = [
    ...owned.map((w) => ({ ...w, temperature: w.temperature ?? "hot", role: "owner" as const })),
    ...shared.map((w) => ({ ...w, temperature: w.temperature ?? "hot", role: w.role as "editor" | "viewer" })),
  ];

  const total = all.length;
  const rows = all.slice(offset, offset + limit);

  return NextResponse.json({ wallets: rows, pagination: { total, limit, offset } });
});

export const POST = withMetrics(async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!user?.emailVerified) {
    return NextResponse.json(
      { error: "Email verification required before creating wallets" },
      { status: 403 },
    );
  }

  const rateResult = await check("createWallet", session.id);
  if (!rateResult.allowed) {
    return rateLimitResponse(rateResult);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const env = getServerEnv();
  const { chain, label } = parsed.data;

  let address: string;
  let secretToStore: string;

  if (chain === "ethereum") {
    const w = createEthereumWallet();
    address = w.address;
    secretToStore = w.privateKey;
  } else if (chain === "solana") {
    const w = createSolanaWallet();
    address = w.address;
    secretToStore = w.secretBs58;
  } else {
    const w = createBitcoinWallet();
    address = w.address;
    secretToStore = w.privateKeyWif;
  }

  const encryptedPrivateKey = encryptSecret(secretToStore, env.ENCRYPTION_KEY);

  const [row] = await db
    .insert(wallets)
    .values({
      userId: session.id,
      chain,
      address,
      encryptedPrivateKey,
      label: label ?? null,
    })
    .returning({
      id: wallets.id,
      chain: wallets.chain,
      address: wallets.address,
      label: wallets.label,
      createdAt: wallets.createdAt,
    });

  return NextResponse.json({ wallet: row });
});
