import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const bodySchema = z.object({
  token: z.string().uuid(),
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
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const [user] = await db
    .select({
      id: users.id,
      emailVerificationExpiry: users.emailVerificationExpiry,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.emailVerificationToken, parsed.data.token))
    .limit(1);

  if (!user) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 400 },
    );
  }

  if (user.emailVerified) {
    return NextResponse.json({ message: "Email already verified" });
  }

  if (
    user.emailVerificationExpiry &&
    user.emailVerificationExpiry < new Date()
  ) {
    return NextResponse.json({ error: "Token expired" }, { status: 400 });
  }

  await db
    .update(users)
    .set({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({ message: "Email verified" });
}
