/**
 * Withdrawal approval workflow.
 *
 * High-value or velocity-triggered withdrawals require multi-approval
 * before the transaction is broadcast on-chain.
 *
 * Flow:
 * 1. User submits withdrawal → system checks thresholds
 * 2. If below threshold → auto-approved, broadcast immediately
 * 3. If above threshold → creates a pending approval request
 * 4. Approvers review and approve/reject
 * 5. Once quorum is met → transaction is broadcast
 */

import { db } from "@/lib/db";
import { withdrawalApprovals, withdrawalVotes } from "@/lib/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import type { DbContext } from "@/lib/db/types";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type WithdrawalRequest = {
  id: string;
  walletId: string;
  requesterId: string;
  chain: string;
  toAddress: string;
  amount: string;
  tokenAddress: string | null;
  status: ApprovalStatus;
  requiredApprovals: number;
  currentApprovals: number;
  expiresAt: Date;
  createdAt: Date;
};

type ThresholdRule = {
  /** Max amount that can be auto-approved (human-readable) */
  autoApproveLimit: string;
  /** Number of approvals required above the limit */
  requiredApprovals: number;
  /** Max withdrawals per hour before velocity check triggers */
  velocityLimit: number;
  /** Approval expiry in milliseconds */
  expiryMs: number;
};

const DEFAULT_RULES: Record<string, ThresholdRule> = {
  ethereum: {
    autoApproveLimit: "1",
    requiredApprovals: 2,
    velocityLimit: 5,
    expiryMs: 24 * 60 * 60 * 1000,
  },
  solana: {
    autoApproveLimit: "50",
    requiredApprovals: 2,
    velocityLimit: 5,
    expiryMs: 24 * 60 * 60 * 1000,
  },
  bitcoin: {
    autoApproveLimit: "0.1",
    requiredApprovals: 2,
    velocityLimit: 3,
    expiryMs: 24 * 60 * 60 * 1000,
  },
};

function getRules(chain: string): ThresholdRule {
  const envLimit = process.env[`${chain.toUpperCase()}_AUTO_APPROVE_LIMIT`];
  const base = DEFAULT_RULES[chain] ?? DEFAULT_RULES.ethereum;
  if (envLimit) {
    return { ...base, autoApproveLimit: envLimit };
  }
  return base;
}

/**
 * Check if a withdrawal requires approval based on amount and velocity.
 */
export async function requiresApproval(
  walletId: string,
  chain: string,
  amount: string,
  ctx: DbContext = db,
): Promise<{ required: boolean; reason?: string }> {
  const rules = getRules(chain);

  // Amount threshold check
  if (parseFloat(amount) > parseFloat(rules.autoApproveLimit)) {
    return { required: true, reason: `Amount exceeds auto-approve limit of ${rules.autoApproveLimit} ${chain}` };
  }

  // Velocity check: count recent withdrawals in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await ctx
    .select({ count: sql<number>`count(*)` })
    .from(withdrawalApprovals)
    .where(
      and(
        eq(withdrawalApprovals.walletId, walletId),
        gte(withdrawalApprovals.createdAt, oneHourAgo),
      ),
    );

  const recentCount = recent[0]?.count ?? 0;
  if (recentCount >= rules.velocityLimit) {
    return { required: true, reason: `Velocity limit exceeded: ${recentCount} withdrawals in the last hour` };
  }

  return { required: false };
}

/**
 * Create a pending withdrawal approval request.
 */
export async function createApprovalRequest(params: {
  walletId: string;
  requesterId: string;
  chain: string;
  toAddress: string;
  amount: string;
  tokenAddress: string | null;
}, ctx: DbContext = db): Promise<string> {
  const rules = getRules(params.chain);
  const expiresAt = new Date(Date.now() + rules.expiryMs);

  const [row] = await ctx
    .insert(withdrawalApprovals)
    .values({
      walletId: params.walletId,
      requesterId: params.requesterId,
      chain: params.chain,
      toAddress: params.toAddress,
      amount: params.amount,
      tokenAddress: params.tokenAddress,
      status: "pending",
      requiredApprovals: rules.requiredApprovals,
      currentApprovals: 0,
      expiresAt,
    })
    .returning({ id: withdrawalApprovals.id });

  return row.id;
}

/**
 * Submit an approval vote for a pending withdrawal.
 */
export async function submitVote(
  approvalId: string,
  voterId: string,
  vote: "approve" | "reject",
  ctx: DbContext = db,
): Promise<{ status: ApprovalStatus; message: string }> {
  // Check the approval exists and is pending
  const [approval] = await ctx
    .select()
    .from(withdrawalApprovals)
    .where(eq(withdrawalApprovals.id, approvalId))
    .limit(1);

  if (!approval) {
    return { status: "pending", message: "Approval request not found" };
  }

  if (approval.status !== "pending") {
    return { status: approval.status as ApprovalStatus, message: `Already ${approval.status}` };
  }

  if (new Date() > approval.expiresAt) {
    await ctx
      .update(withdrawalApprovals)
      .set({ status: "expired" })
      .where(eq(withdrawalApprovals.id, approvalId));
    return { status: "expired", message: "Approval request has expired" };
  }

  // Prevent requester from approving their own request
  if (approval.requesterId === voterId) {
    return { status: "pending", message: "Cannot approve your own withdrawal request" };
  }

  // Record vote (idempotent)
  await ctx
    .insert(withdrawalVotes)
    .values({ approvalId, voterId, vote })
    .onConflictDoNothing();

  if (vote === "reject") {
    await ctx
      .update(withdrawalApprovals)
      .set({ status: "rejected" })
      .where(eq(withdrawalApprovals.id, approvalId));
    return { status: "rejected", message: "Withdrawal rejected" };
  }

  // Count approvals
  const [{ count }] = await ctx
    .select({ count: sql<number>`count(*)` })
    .from(withdrawalVotes)
    .where(and(eq(withdrawalVotes.approvalId, approvalId), eq(withdrawalVotes.vote, "approve")));

  const newCount = Number(count);
  const newStatus: ApprovalStatus = newCount >= approval.requiredApprovals ? "approved" : "pending";

  await ctx
    .update(withdrawalApprovals)
    .set({ currentApprovals: newCount, status: newStatus })
    .where(eq(withdrawalApprovals.id, approvalId));

  return {
    status: newStatus,
    message: newStatus === "approved"
      ? "Quorum reached — withdrawal approved for broadcast"
      : `Vote recorded (${newCount}/${approval.requiredApprovals})`,
  };
}

/**
 * Get pending approvals for a wallet.
 */
export async function getPendingApprovals(
  walletId: string,
  ctx: DbContext = db,
): Promise<WithdrawalRequest[]> {
  const rows = await ctx
    .select()
    .from(withdrawalApprovals)
    .where(and(eq(withdrawalApprovals.walletId, walletId), eq(withdrawalApprovals.status, "pending")));
  return rows as unknown as WithdrawalRequest[];
}
