import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  generateTotpSecret,
  generateQrDataUrl,
  encryptTotpSecret,
} from "@/lib/auth/totp";

export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({ totpEnabled: users.totpEnabled })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.totpEnabled) {
    return NextResponse.json(
      { error: "2FA is already enabled" },
      { status: 400 },
    );
  }

  const env = getServerEnv();
  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret, env.ENCRYPTION_KEY);

  await db
    .update(users)
    .set({ totpSecret: encrypted })
    .where(eq(users.id, session.id));

  const qrCode = await generateQrDataUrl(session.email, secret);

  return NextResponse.json({ qrCode, manualKey: secret });
}
