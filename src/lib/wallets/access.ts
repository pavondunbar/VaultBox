import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wallets, walletShares, type WalletRow } from "@/lib/db/schema";

export type WalletRole = "owner" | "editor" | "viewer";

export type WalletAccess = {
  wallet: WalletRow;
  role: WalletRole;
};

const ROLE_LEVEL: Record<WalletRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

export function hasMinRole(
  actual: WalletRole,
  required: WalletRole,
): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}

export async function getWalletForUser(
  walletId: string,
  userId: string,
): Promise<WalletAccess | null> {
  const owned = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .limit(1);

  if (owned[0]) {
    return { wallet: owned[0], role: "owner" };
  }

  const shared = await db
    .select({ wallet: wallets, role: walletShares.role })
    .from(walletShares)
    .innerJoin(wallets, eq(wallets.id, walletShares.walletId))
    .where(
      and(
        eq(walletShares.walletId, walletId),
        eq(walletShares.userId, userId),
      ),
    )
    .limit(1);

  if (shared[0]) {
    return {
      wallet: shared[0].wallet,
      role: shared[0].role as WalletRole,
    };
  }

  return null;
}

export async function requireWalletAccess(
  walletId: string,
  userId: string,
  minRole: WalletRole,
): Promise<WalletAccess | null> {
  const access = await getWalletForUser(walletId, userId);
  if (!access) {
    return null;
  }
  if (!hasMinRole(access.role, minRole)) {
    return null;
  }
  return access;
}
