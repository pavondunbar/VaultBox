import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/auth/totp";

const bodySchema = z.object({
  code: z.string().length(6),
});

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      { error: "Invalid code format" },
      { status: 400 },
    );
  }

  const [user] = await db
    .select({
      totpSecret: users.totpSecret,
      totpEnabled: users.totpEnabled,
    })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!user?.totpSecret) {
    return NextResponse.json(
      { error: "Run 2FA setup first" },
      { status: 400 },
    );
  }

  if (user.totpEnabled) {
    return NextResponse.json(
      { error: "2FA is already enabled" },
      { status: 400 },
    );
  }

  const env = getServerEnv();
  const secret = decryptTotpSecret(user.totpSecret, env.ENCRYPTION_KEY);
  const valid = verifyTotpCode(secret, parsed.data.code);

  if (!valid) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ totpEnabled: true })
    .where(eq(users.id, session.id));

  return NextResponse.json({ message: "2FA enabled" });
}
