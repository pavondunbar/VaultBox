import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";
import { encryptSecret } from "@/lib/crypto/vault";
import { createEthereumWallet } from "@/lib/chains/ethereum";
import { createSolanaWallet } from "@/lib/chains/solana";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";

const createSchema = z.object({
  chain: z.enum(["ethereum", "solana"]),
  label: z.string().max(64).optional(),
});

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: wallets.id,
      chain: wallets.chain,
      address: wallets.address,
      label: wallets.label,
      createdAt: wallets.createdAt,
    })
    .from(wallets)
    .where(eq(wallets.userId, session.id))
    .orderBy(desc(wallets.createdAt));

  return NextResponse.json({ wallets: rows });
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  } else {
    const w = createSolanaWallet();
    address = w.address;
    secretToStore = w.secretBs58;
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
}
