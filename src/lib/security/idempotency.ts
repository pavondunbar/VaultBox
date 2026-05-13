import { db } from "@/lib/db";
import { idempotencyKeys } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Check for a cached idempotent response. Returns the cached NextResponse if found, null otherwise.
 */
export async function getCachedResponse(
  key: string,
  userId: string,
): Promise<NextResponse | null> {
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.userId, userId)))
    .limit(1);

  if (!existing) return null;

  return NextResponse.json(JSON.parse(existing.response), {
    status: parseInt(existing.statusCode, 10),
    headers: { "X-Idempotent-Replay": "true" },
  });
}

/**
 * Store a response for future idempotent replays.
 */
export async function cacheResponse(
  key: string,
  userId: string,
  body: unknown,
  statusCode: number,
): Promise<void> {
  await db.insert(idempotencyKeys).values({
    key,
    userId,
    response: JSON.stringify(body),
    statusCode: String(statusCode),
  });
}
