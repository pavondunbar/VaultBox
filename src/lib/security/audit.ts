import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

export type AuditAction =
  | "wallet.create"
  | "wallet.send"
  | "wallet.transfer"
  | "wallet.sign"
  | "wallet.rbf"
  | "wallet.share"
  | "wallet.share.revoke"
  | "auth.login"
  | "auth.register"
  | "auth.2fa.enable"
  | "auth.2fa.disable";

export async function recordAudit(params: {
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLogs).values({
    userId: params.userId ?? null,
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId ?? null,
    ip: params.ip ?? null,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
  });
}
