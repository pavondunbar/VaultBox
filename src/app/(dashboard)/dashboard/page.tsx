import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { wallets, walletShares, walletTemperature } from "@/lib/db/schema";
import { CreateWalletForm } from "@/components/CreateWalletForm";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const owned = await db
    .select({
      id: wallets.id,
      chain: wallets.chain,
      address: wallets.address,
      label: wallets.label,
      createdAt: wallets.createdAt,
      temperature: walletTemperature.temperature,
    })
    .from(wallets)
    .leftJoin(walletTemperature, eq(walletTemperature.walletId, wallets.id))
    .where(eq(wallets.userId, user.id))
    .orderBy(desc(wallets.createdAt));

  const shared = await db
    .select({
      id: wallets.id,
      chain: wallets.chain,
      address: wallets.address,
      label: wallets.label,
      createdAt: wallets.createdAt,
      role: walletShares.role,
      temperature: walletTemperature.temperature,
    })
    .from(walletShares)
    .innerJoin(wallets, eq(wallets.id, walletShares.walletId))
    .leftJoin(walletTemperature, eq(walletTemperature.walletId, wallets.id))
    .where(eq(walletShares.userId, user.id))
    .orderBy(desc(wallets.createdAt));

  const list = [
    ...owned.map((w) => ({ ...w, temperature: (w.temperature ?? "hot") as "hot" | "cold", role: "owner" as const })),
    ...shared.map((w) => ({ ...w, temperature: (w.temperature ?? "hot") as "hot" | "cold", role: w.role as "editor" | "viewer" })),
  ];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-white">Your wallets</h1>
        <p className="mt-1 text-sm text-slate-400">
          Create custodial wallets backed by encrypted keys. Keys never leave
          the server API you call.
        </p>
      </div>

      <CreateWalletForm />

      <div className="grid gap-4 sm:grid-cols-2">
        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 bg-ink-900/40 px-6 py-12 text-center text-sm text-slate-500">
            No wallets yet — create an Ethereum or Solana wallet above.
          </p>
        ) : (
          list.map((w) => (
            <Link
              key={w.id}
              href={`/wallet/${w.id}`}
              className="group rounded-xl border border-white/10 bg-ink-900/60 p-5 transition hover:border-mint-500/40 hover:bg-ink-900"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-mint-400">
                    {w.chain}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                    w.temperature === "cold"
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-orange-500/20 text-orange-400"
                  }`}>
                    {w.temperature === "cold" ? "🧊 Cold" : "🔥 Hot"}
                  </span>
                  {w.role !== "owner" && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400">
                      Shared ({w.role})
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500 group-hover:text-slate-400">
                  Open →
                </span>
              </div>
              <p className="mt-3 font-mono text-xs text-slate-300 break-all">
                {w.address}
              </p>
              {w.label && (
                <p className="mt-2 text-sm text-slate-400">{w.label}</p>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
