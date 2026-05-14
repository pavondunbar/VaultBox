"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [totpCode, setTotpCode] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Sign in failed",
        );
        return;
      }
      if (data.requires2FA) {
        setRequires2FA(true);
        setTempToken(data.tempToken as string);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tempToken, code: totpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "2FA verification failed",
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
          VaultBox
        </p>
        <h1 className="mt-2 text-center text-2xl font-semibold text-white">
          {requires2FA ? "Two-Factor Authentication" : "Sign in"}
        </h1>

        {requires2FA ? (
          <form onSubmit={onVerify2FA} className="mt-8 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400">
                Enter your 6-digit authenticator code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={totpCode}
                onChange={(e) =>
                  setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-center font-mono text-lg tracking-[0.5em] outline-none ring-mint-500/40 focus:ring-2"
                placeholder="000000"
              />
            </div>
            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full rounded-lg bg-mint-600 px-4 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-mint-500 disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRequires2FA(false);
                setTempToken("");
                setTotpCode("");
                setError(null);
              }}
              className="w-full text-sm text-slate-500 hover:text-slate-300"
            >
              Back to login
            </button>
          </form>
        ) : (
          <>
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
                  Password
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
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
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              New here?{" "}
              <Link href="/register" className="text-mint-400 hover:underline">
                Create an account
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
