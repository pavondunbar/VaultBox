"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateWalletForm() {
  const router = useRouter();
  const [chain, setChain] = useState<"ethereum" | "solana" | "bitcoin">("ethereum");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          chain,
          label: label.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed");
        return;
      }
      setLabel("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-white/10 bg-ink-900/50 p-6 sm:flex-row sm:items-end"
    >
      <div className="flex-1 space-y-3">
        <label className="block text-xs font-medium text-slate-400">
          Chain
        </label>
        <select
          value={chain}
          onChange={(e) =>
            setChain(e.target.value as "ethereum" | "solana" | "bitcoin")
          }
          className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none ring-mint-500/40 focus:ring-2"
        >
          <option value="ethereum">Ethereum (Sepolia)</option>
          <option value="solana">Solana (Devnet)</option>
          <option value="bitcoin">Bitcoin (Testnet)</option>
        </select>
      </div>
      <div className="flex-[2] space-y-3">
        <label className="block text-xs font-medium text-slate-400">
          Label (optional)
        </label>
        <input
          type="text"
          placeholder="e.g. Spending"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={64}
          className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none ring-mint-500/40 focus:ring-2"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-mint-600 px-5 py-2 text-sm font-medium text-ink-950 hover:bg-mint-500 disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create wallet"}
      </button>
      {error && (
        <p className="sm:col-span-full text-sm text-red-400">{error}</p>
      )}
    </form>
  );
}
