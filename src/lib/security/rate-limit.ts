/**
 * Redis-backed distributed rate limiter using sliding window algorithm.
 * Falls back to in-memory when Redis is unavailable.
 *
 * Requires REDIS_URL environment variable for distributed mode.
 * Without it, uses the existing in-memory store (single-instance only).
 */

import { createClient, type RedisClientType } from "redis";

type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

const LIMITS: Record<string, RateLimitConfig> = {
  login: { limit: 5, windowMs: 15 * 60 * 1000 },
  register: { limit: 3, windowMs: 15 * 60 * 1000 },
  send: { limit: 10, windowMs: 60 * 1000 },
  sign: { limit: 20, windowMs: 60 * 1000 },
  createWallet: { limit: 5, windowMs: 60 * 60 * 1000 },
  sync: { limit: 10, windowMs: 60_000 },
  share: { limit: 10, windowMs: 60 * 60 * 1000 },
  resendVerification: { limit: 3, windowMs: 15 * 60 * 1000 },
  withdrawal: { limit: 5, windowMs: 60 * 60 * 1000 },
};

// --- Redis client singleton ---
let redis: RedisClientType | null = null;
let redisReady = false;

async function getRedis(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redis && redisReady) return redis;
  if (redis) return null; // connecting

  try {
    redis = createClient({ url }) as RedisClientType;
    redis.on("error", () => { redisReady = false; });
    redis.on("ready", () => { redisReady = true; });
    await redis.connect();
    redisReady = true;
    return redis;
  } catch {
    redis = null;
    redisReady = false;
    return null;
  }
}

// --- In-memory fallback ---
const memStore = new Map<string, number[]>();

function checkMemory(category: string, key: string): RateLimitResult {
  const config = LIMITS[category];
  if (!config) return { allowed: true, remaining: Infinity, retryAfterMs: 0 };

  const storeKey = `${category}:${key}`;
  const now = Date.now();
  const cutoff = now - config.windowMs;
  const timestamps = (memStore.get(storeKey) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= config.limit) {
    const retryAfterMs = timestamps[0] + config.windowMs - now;
    memStore.set(storeKey, timestamps);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  timestamps.push(now);
  memStore.set(storeKey, timestamps);
  return { allowed: true, remaining: config.limit - timestamps.length, retryAfterMs: 0 };
}

// --- Redis sliding window ---
async function checkRedis(
  client: RedisClientType,
  category: string,
  key: string,
): Promise<RateLimitResult> {
  const config = LIMITS[category];
  if (!config) return { allowed: true, remaining: Infinity, retryAfterMs: 0 };

  const storeKey = `rl:${category}:${key}`;
  const now = Date.now();
  const cutoff = now - config.windowMs;

  // Atomic sliding window via sorted set
  const multi = client.multi();
  multi.zRemRangeByScore(storeKey, 0, cutoff);
  multi.zCard(storeKey);
  multi.zRangeWithScores(storeKey, 0, 0);
  const results = await multi.exec();

  const count = (results[1] as number) ?? 0;

  if (count >= config.limit) {
    const oldest = results[2] as unknown as Array<{ score: number }>;
    const oldestTime = oldest?.[0]?.score ?? now;
    const retryAfterMs = oldestTime + config.windowMs - now;
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  // Add current request
  await client.zAdd(storeKey, { score: now, value: `${now}:${Math.random()}` });
  await client.expire(storeKey, Math.ceil(config.windowMs / 1000));

  return { allowed: true, remaining: config.limit - count - 1, retryAfterMs: 0 };
}

// --- Public API (same interface as original) ---

export async function check(category: string, key: string): Promise<RateLimitResult> {
  const client = await getRedis();
  if (client) {
    try {
      return await checkRedis(client, category, key);
    } catch {
      // Redis failure — fall back to memory
    }
  }
  return checkMemory(category, key);
}

/**
 * Synchronous check for backward compatibility.
 * Uses in-memory store only. Prefer async `check()` for distributed mode.
 */
export function checkSync(category: string, key: string): RateLimitResult {
  return checkMemory(category, key);
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
  return new Response(
    JSON.stringify({ error: "Too many requests", retryAfterMs: result.retryAfterMs }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export function resetStore(): void {
  memStore.clear();
}
