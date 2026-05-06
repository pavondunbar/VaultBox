import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getWalletForUser } from "@/lib/wallets/access";
import { WalletDetail } from "@/components/WalletDetail";

type Props = { params: Promise<{ id: string }> };

export default async function WalletPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }

  const { id } = await params;
  const wallet = await getWalletForUser(id, user.id);
  if (!wallet) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard"
        className="inline-flex text-sm text-mint-400 hover:underline"
      >
        ← Back to wallets
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-mint-400">
            {wallet.chain}
          </span>
          {wallet.label && (
            <span className="text-lg font-medium text-white">{wallet.label}</span>
          )}
        </div>
        <p className="mt-3 font-mono text-sm text-slate-300 break-all">
          {wallet.address}
        </p>
      </div>

      <WalletDetail
        walletId={wallet.id}
        chain={wallet.chain as "ethereum" | "solana"}
      />
    </div>
  );
}
