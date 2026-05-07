import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { getCookieName, signSessionToken } from "@/lib/auth/jwt";
import { getJwtSecret, getSmtpEnv } from "@/lib/env";
import { sendVerificationEmail } from "@/lib/auth/email";
import { check, getClientIp, rateLimitResponse } from "@/lib/security/rate-limit";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateResult = check("register", ip);
  if (!rateResult.allowed) {
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
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);
    const smtpConfigured = getSmtpEnv() !== null;
    const verificationToken = crypto.randomUUID();
    const verificationExpiry = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    );

    const [created] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        emailVerified: !smtpConfigured,
        emailVerificationToken: smtpConfigured
          ? verificationToken
          : null,
        emailVerificationExpiry: smtpConfigured
          ? verificationExpiry
          : null,
      })
      .returning({ id: users.id, email: users.email });

    if (smtpConfigured) {
      await sendVerificationEmail(created.email, verificationToken);
    }

    const token = await signSessionToken(
      { sub: created.id, email: created.email },
      getJwtSecret(),
    );

    const res = NextResponse.json({
      user: { id: created.id, email: created.email },
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
    console.error("Registration error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
