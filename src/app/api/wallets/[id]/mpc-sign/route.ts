import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { thresholdSign } from "@/lib/crypto/mpc";

/**
 * POST /api/wallets/:id/mpc-sign
 * Body: { message: string, shares: { index: number, data: string }[] }
 *
 * Signs a message using threshold MPC — the full private key is never
 * reconstructed in memory. Each share contributes a partial signature
 * that is combined into the final ECDSA signature.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as {
    message?: string;
    shares?: { index: number; data: string }[];
  };

  if (!body.message || !body.shares || body.shares.length < 2) {
    return NextResponse.json(
      { error: "message and at least 2 shares required" },
      { status: 400 },
    );
  }

  try {
    // Hash the message (Ethereum personal_sign prefix)
    const prefix = `\x19Ethereum Signed Message:\n${body.message.length}`;
    const messageHash = crypto
      .createHash("sha256")
      .update(Buffer.concat([Buffer.from(prefix), Buffer.from(body.message)]))
      .digest();

    // Threshold sign without reconstructing the full key
    const { r, s, v } = await thresholdSign(body.shares, messageHash);
    const signature = `0x${r}${s}${v.toString(16).padStart(2, "0")}`;

    return NextResponse.json({ walletId: id, signature });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
