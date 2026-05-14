import { NextResponse } from "next/server";
import { rotateEncryptionKey } from "@/lib/crypto/key-rotation";

/**
 * POST /api/admin/rotate-key
 * Body: { oldKey: string, newKey: string }
 * Re-encrypts all wallet private keys with the new master key.
 */
export async function POST(req: Request) {
  const body = await req.json() as { oldKey?: string; newKey?: string };
  if (!body.oldKey || !body.newKey) {
    return NextResponse.json({ error: "oldKey and newKey required" }, { status: 400 });
  }

  const currentKey = process.env.ENCRYPTION_KEY;
  if (body.oldKey !== currentKey) {
    return NextResponse.json({ error: "oldKey does not match current ENCRYPTION_KEY" }, { status: 403 });
  }

  try {
    const result = await rotateEncryptionKey(body.oldKey, body.newKey);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
