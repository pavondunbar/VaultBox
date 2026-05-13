import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { reconcilePendingTransactions } from "@/lib/transactions/reconcile";

/**
 * POST /api/admin/reconcile
 * Triggers reconciliation of all pending transactions.
 * Requires an authenticated session.
 */
export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await reconcilePendingTransactions();
  return NextResponse.json(result);
}
