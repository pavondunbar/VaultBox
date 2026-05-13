import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { requireWalletAccess } from "@/lib/wallets/access";
import {
  getPendingApprovals,
  submitVote,
} from "@/lib/transactions/approval";

const idSchema = z.string().uuid();
const voteSchema = z.object({
  approvalId: z.string().uuid(),
  vote: z.enum(["approve", "reject"]),
});

/** GET — list pending withdrawal approvals for a wallet */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid wallet id" }, { status: 400 });
  }

  const access = await requireWalletAccess(id, session.id, "viewer");
  if (!access) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const approvals = await getPendingApprovals(id);
  return NextResponse.json({ approvals });
}

/** POST — submit an approval vote */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid wallet id" }, { status: 400 });
  }

  const access = await requireWalletAccess(id, session.id, "editor");
  if (!access) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = voteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const result = await submitVote(parsed.data.approvalId, session.id, parsed.data.vote);
  return NextResponse.json(result);
}
