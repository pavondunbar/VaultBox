import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendVerificationEmail } from "@/lib/auth/email";
import { check, rateLimitResponse } from "@/lib/security/rate-limit";

export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateResult = await check("resendVerification", session.id);
  if (!rateResult.allowed) {
    return rateLimitResponse(rateResult);
  }

  const [user] = await db
    .select({ emailVerified: users.emailVerified, email: users.email })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ message: "Email already verified" });
  }

  const token = crypto.randomUUID();
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db
    .update(users)
    .set({
      emailVerificationToken: token,
      emailVerificationExpiry: expiry,
    })
    .where(eq(users.id, session.id));

  await sendVerificationEmail(user.email, token);

  return NextResponse.json({ message: "Verification email sent" });
}
