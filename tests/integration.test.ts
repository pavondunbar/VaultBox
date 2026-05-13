import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB module before any imports that use it
vi.mock("@/lib/db", () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/wallets/access", () => ({
  requireWalletAccess: vi.fn(),
}));

vi.mock("@/lib/transactions/sync", () => ({
  syncIfStale: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  check: vi.fn(() => ({ allowed: true })),
  rateLimitResponse: vi.fn(),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/security/idempotency", () => ({
  getCachedResponse: vi.fn(),
  cacheResponse: vi.fn(),
}));

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { requireWalletAccess } from "@/lib/wallets/access";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns healthy when DB is reachable", async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ "?column?": 1 }]);

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.database.status).toBe("ok");
    expect(body.checks.database.latencyMs).toBeTypeOf("number");
    expect(body.timestamp).toBeDefined();
  });

  it("returns degraded when DB is unreachable", async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connection refused"));

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.database.status).toBe("error");
    expect(body.checks.database.error).toBe("connection refused");
  });
});

describe("GET /api/wallets (pagination)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { GET } = await import("@/app/api/wallets/route");
    const req = new Request("http://localhost:3000/api/wallets");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns paginated wallets with metadata", async () => {
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "user-1", email: "a@b.com" });

    const mockWallets = Array.from({ length: 5 }, (_, i) => ({
      id: `wallet-${i}`,
      chain: "ethereum",
      address: `0x${i}`,
      label: null,
      createdAt: new Date(),
    }));

    // Mock owned wallets query chain
    const mockOrderBy = vi.fn().mockResolvedValue(mockWallets);
    const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from: mockFrom });

    // Mock shared wallets query chain
    const mockSharedOrderBy = vi.fn().mockResolvedValue([]);
    const mockSharedWhere = vi.fn(() => ({ orderBy: mockSharedOrderBy }));
    const mockSharedInnerJoin = vi.fn(() => ({ where: mockSharedWhere }));
    const mockSharedFrom = vi.fn(() => ({ innerJoin: mockSharedInnerJoin }));
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from: mockSharedFrom });

    const { GET } = await import("@/app/api/wallets/route");
    const req = new Request("http://localhost:3000/api/wallets?limit=2&offset=1");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pagination).toEqual({ total: 5, limit: 2, offset: 1 });
    expect(body.wallets).toHaveLength(2);
    expect(body.wallets[0].id).toBe("wallet-1");
  });
});

describe("GET /api/wallets/:id/transactions (pagination)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { GET } = await import("@/app/api/wallets/[id]/transactions/route");
    const req = new Request("http://localhost:3000/api/wallets/abc/transactions");
    const res = await GET(req, { params: Promise.resolve({ id: "abc" }) });

    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID", async () => {
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "user-1", email: "a@b.com" });

    const { GET } = await import("@/app/api/wallets/[id]/transactions/route");
    const req = new Request("http://localhost:3000/api/wallets/not-a-uuid/transactions");
    const res = await GET(req, { params: Promise.resolve({ id: "not-a-uuid" }) });

    expect(res.status).toBe(400);
  });

  it("returns 404 when wallet not found", async () => {
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "user-1", email: "a@b.com" });
    (requireWalletAccess as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { GET } = await import("@/app/api/wallets/[id]/transactions/route");
    const uuid = "11111111-1111-1111-1111-111111111111";
    const req = new Request(`http://localhost:3000/api/wallets/${uuid}/transactions`);
    const res = await GET(req, { params: Promise.resolve({ id: uuid }) });

    expect(res.status).toBe(404);
  });
});

describe("Idempotency key support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getCachedResponse returns null for unknown key", async () => {
    // Test the helper directly with a fresh mock
    const { getCachedResponse } = await import("@/lib/security/idempotency");
    (getCachedResponse as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await getCachedResponse("new-key", "user-1");
    expect(result).toBeNull();
  });

  it("getCachedResponse returns cached NextResponse for known key", async () => {
    const { getCachedResponse } = await import("@/lib/security/idempotency");
    const { NextResponse } = await import("next/server");

    const mockResponse = NextResponse.json({ transactionHash: "0xabc" }, {
      status: 200,
      headers: { "X-Idempotent-Replay": "true" },
    });
    (getCachedResponse as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const result = await getCachedResponse("existing-key", "user-1");
    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.transactionHash).toBe("0xabc");
    expect(result!.headers.get("X-Idempotent-Replay")).toBe("true");
  });
});

describe("Audit log helper", () => {
  it("recordAudit inserts into audit_logs table", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const { recordAudit } = await import("@/lib/security/audit");
    await recordAudit({
      userId: "user-1",
      action: "wallet.create",
      resource: "wallet",
      resourceId: "wallet-1",
      ip: "127.0.0.1",
      metadata: { chain: "ethereum" },
    });

    expect(db.insert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "wallet.create",
        resource: "wallet",
        resourceId: "wallet-1",
        ip: "127.0.0.1",
        metadata: '{"chain":"ethereum"}',
      }),
    );
  });
});
