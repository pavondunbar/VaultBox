import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import {
  getCookieName,
  signSessionToken,
  signTwoFactorToken,
} from "@/lib/auth/jwt";
import { getJwtSecret } from "@/lib/env";
import {
  check,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import { logSecurityEvent } from "@/lib/security/logger";
import { withMetrics } from "@/lib/monitoring/instrument";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const POST = withMetrics(async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateResult = await check("login", ip);
  if (!rateResult.allowed) {
    logSecurityEvent({
      timestamp: new Date().toISOString(),
      event: "rate_limit_hit",
      ip,
      details: "login",
    });
    return rateLimitResponse(rateResult);
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

  const { email, password } = parsed.data;

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      logSecurityEvent({
        timestamp: new Date().toISOString(),
        event: "failed_login",
        ip,
        details: email.toLowerCase(),
      });
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const jwtSecret = getJwtSecret();

    if (user.totpEnabled) {
      const tempToken = await signTwoFactorToken(
        { sub: user.id, email: user.email },
        jwtSecret,
      );
      return NextResponse.json({ requires2FA: true, tempToken });
    }

    const token = await signSessionToken(
      { sub: user.id, email: user.email },
      jwtSecret,
    );

    const res = NextResponse.json({
      user: { id: user.id, email: user.email },
    });
    res.cookies.set(getCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
