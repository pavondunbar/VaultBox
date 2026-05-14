import { db } from "@/lib/db";
import { idempotencyKeys } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
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
 * Atomically claim an idempotency key and cache the response.
 * Uses INSERT ... ON CONFLICT DO NOTHING to prevent TOCTOU races —
 * if two concurrent requests race, only one INSERT succeeds.
 * Returns true if this call won the race, false if the key was already claimed.
 */
export async function cacheResponse(
  key: string,
  userId: string,
  body: unknown,
  statusCode: number,
): Promise<boolean> {
  const result = await db
    .insert(idempotencyKeys)
    .values({
      key,
      userId,
      response: JSON.stringify(body),
      statusCode: String(statusCode),
    })
    .onConflictDoNothing({ target: [idempotencyKeys.key, idempotencyKeys.userId] });

  // rowCount = 0 means conflict (key already existed)
  return (result.rowCount ?? 0) > 0;
}
