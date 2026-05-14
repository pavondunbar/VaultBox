import { NextResponse } from "next/server";
import { reconstructPrivateKey } from "@/lib/crypto/mpc";

/**
 * POST /api/wallets/:id/mpc-sign
 * Body: { message: string, shares: { index: number, data: string }[] }
 *
 * Reconstructs the private key from threshold shares and signs the message.
 * In production, each share would come from a separate custodian/server.
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
    const privateKeyHex = reconstructPrivateKey(body.shares);

    // Sign using the reconstructed key (Ethereum secp256k1 signing)
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(`0x${privateKeyHex}` as `0x${string}`);
    const signature = await account.signMessage({ message: body.message });

    return NextResponse.json({ walletId: id, signature });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
