import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { check, resetStore, getClientIp, rateLimitResponse } from "@/lib/security/rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within limit", () => {
    for (let i = 0; i < 5; i++) {
      const result = check("login", "192.168.1.1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it("blocks requests over limit", () => {
    for (let i = 0; i < 5; i++) {
      check("login", "192.168.1.1");
    }
    const result = check("login", "192.168.1.1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after window expires", () => {
    for (let i = 0; i < 5; i++) {
      check("login", "192.168.1.1");
    }
    const blocked = check("login", "192.168.1.1");
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    const result = check("login", "192.168.1.1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks independent keys separately", () => {
    for (let i = 0; i < 5; i++) {
      check("login", "192.168.1.1");
    }
    const blocked = check("login", "192.168.1.1");
    expect(blocked.allowed).toBe(false);

    const otherIp = check("login", "10.0.0.1");
    expect(otherIp.allowed).toBe(true);
  });

  it("returns unknown category as always allowed", () => {
    const result = check("nonexistent", "key");
    expect(result.allowed).toBe(true);
  });

  it("getClientIp extracts first IP from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("getClientIp returns unknown when no header present", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("rateLimitResponse returns 429 with correct headers", () => {
    const result = { allowed: false, remaining: 0, retryAfterMs: 5000 };
    const resp = rateLimitResponse(result);
    expect(resp.status).toBe(429);
    expect(resp.headers.get("Retry-After")).toBe("5");
  });
});
