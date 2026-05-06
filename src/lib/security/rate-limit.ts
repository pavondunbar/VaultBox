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
};

const store = new Map<string, number[]>();

const CLEANUP_INTERVAL_MS = 60_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of store) {
      const config = LIMITS[key.split(":")[0]];
      if (!config) {
        store.delete(key);
        continue;
      }
      const cutoff = now - config.windowMs;
      const filtered = timestamps.filter((t) => t > cutoff);
      if (filtered.length === 0) {
        store.delete(key);
      } else {
        store.set(key, filtered);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

export function check(category: string, key: string): RateLimitResult {
  ensureCleanup();

  const config = LIMITS[category];
  if (!config) {
    return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
  }

  const storeKey = `${category}:${key}`;
  const now = Date.now();
  const cutoff = now - config.windowMs;

  const timestamps = (store.get(storeKey) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= config.limit) {
    const oldest = timestamps[0];
    const retryAfterMs = oldest + config.windowMs - now;
    store.set(storeKey, timestamps);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  timestamps.push(now);
  store.set(storeKey, timestamps);
  return {
    allowed: true,
    remaining: config.limit - timestamps.length,
    retryAfterMs: 0,
  };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}

export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      retryAfterMs: result.retryAfterMs,
    }),
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
  store.clear();
}
