import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      totpEnabled: users.totpEnabled,
    })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user });
}
