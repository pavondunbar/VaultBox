import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getJwtSecret, getServerEnv } from "@/lib/env";
import {
  getCookieName,
  signSessionToken,
  verifyTwoFactorToken,
} from "@/lib/auth/jwt";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/auth/totp";
import { logSecurityEvent } from "@/lib/security/logger";
import { getClientIp } from "@/lib/security/rate-limit";

const bodySchema = z.object({
  token: z.string().min(1),
  code: z.string().length(6),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 },
    );
  }

  const jwtSecret = getJwtSecret();
  const payload = await verifyTwoFactorToken(parsed.data.token, jwtSecret);

  if (!payload) {
    return NextResponse.json(
      { error: "Invalid or expired 2FA token" },
      { status: 401 },
    );
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      totpSecret: users.totpSecret,
      totpEnabled: users.totpEnabled,
    })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user?.totpEnabled || !user.totpSecret) {
    return NextResponse.json(
      { error: "2FA is not enabled for this account" },
      { status: 400 },
    );
  }

  const env = getServerEnv();
  const secret = decryptTotpSecret(user.totpSecret, env.ENCRYPTION_KEY);
  const valid = verifyTotpCode(secret, parsed.data.code);

  if (!valid) {
    const ip = getClientIp(request);
    logSecurityEvent({
      timestamp: new Date().toISOString(),
      event: "2fa_failed",
      ip,
      userId: user.id,
    });
    return NextResponse.json({ error: "Invalid 2FA code" }, { status: 401 });
  }

  const sessionToken = await signSessionToken(
    { sub: user.id, email: user.email },
    jwtSecret,
  );

  const res = NextResponse.json({
    user: { id: user.id, email: user.email },
  });
  res.cookies.set(getCookieName(), sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
