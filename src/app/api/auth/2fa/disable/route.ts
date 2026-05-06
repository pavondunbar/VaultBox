import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/auth/totp";

const bodySchema = z.object({
  code: z.string().length(6),
  password: z.string().min(1),
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
      { error: "Invalid request" },
      { status: 400 },
    );
  }

  const [user] = await db
    .select({
      passwordHash: users.passwordHash,
      totpSecret: users.totpSecret,
      totpEnabled: users.totpEnabled,
    })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!user?.totpEnabled || !user.totpSecret) {
    return NextResponse.json(
      { error: "2FA is not enabled" },
      { status: 400 },
    );
  }

  const passwordValid = await verifyPassword(
    parsed.data.password,
    user.passwordHash,
  );
  if (!passwordValid) {
    return NextResponse.json(
      { error: "Invalid password" },
      { status: 401 },
    );
  }

  const env = getServerEnv();
  const secret = decryptTotpSecret(user.totpSecret, env.ENCRYPTION_KEY);
  const codeValid = verifyTotpCode(secret, parsed.data.code);

  if (!codeValid) {
    return NextResponse.json({ error: "Invalid 2FA code" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null })
    .where(eq(users.id, session.id));

  return NextResponse.json({ message: "2FA disabled" });
}
