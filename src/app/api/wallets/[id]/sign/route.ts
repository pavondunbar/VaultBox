import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";
import { signEthMessage } from "@/lib/chains/ethereum";
import { signSolanaMessage } from "@/lib/chains/solana";
import { unlockWalletKey } from "@/lib/wallets/key";
import { requireWalletAccess } from "@/lib/wallets/access";
import { check, rateLimitResponse } from "@/lib/security/rate-limit";

const idSchema = z.string().uuid();

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
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

  const rateResult = check("sign", session.id);
  if (!rateResult.allowed) {
    return rateLimitResponse(rateResult);
  }

  const access = await requireWalletAccess(id, session.id, "editor");
  if (!access) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }
  const { wallet } = access;

  const env = getServerEnv();
  const secret = unlockWalletKey(wallet, env.ENCRYPTION_KEY);

  try {
    if (wallet.chain === "ethereum") {
      const signedMessage = await signEthMessage(secret, parsed.data.message);
      return NextResponse.json({ signedMessage });
    }
    const signedMessage = signSolanaMessage(secret, parsed.data.message);
    return NextResponse.json({ signedMessage });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Signing failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
