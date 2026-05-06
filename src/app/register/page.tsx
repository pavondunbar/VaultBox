"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Registration failed",
        );
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-white/10 bg-ink-900/80 p-8 shadow-xl backdrop-blur">
        <p className="text-center text-sm uppercase tracking-[0.2em] text-mint-400">
          VenCura
        </p>
        <h1 className="mt-2 text-center text-2xl font-semibold text-white">
          Create account
        </h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          Custodial wallets on Sepolia & Solana Devnet
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none ring-mint-500/40 focus:ring-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400">
              Password (min 8 characters)
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none ring-mint-500/40 focus:ring-2"
            />
          </div>
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-mint-600 px-4 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-mint-500 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Register"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-mint-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
