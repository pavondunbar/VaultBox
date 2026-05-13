import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET() {
  const checks: Record<string, { status: "ok" | "error"; latencyMs?: number; error?: string }> = {};

  // DB connectivity check
  const dbStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { status: "error", latencyMs: Date.now() - dbStart, error: (err as Error).message };
  }

  const overall = Object.values(checks).every((c) => c.status === "ok") ? "healthy" : "degraded";

  return NextResponse.json(
    { status: overall, timestamp: new Date().toISOString(), checks },
    { status: overall === "healthy" ? 200 : 503 },
  );
}
