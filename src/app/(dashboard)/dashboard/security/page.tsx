"use client";

import { useCallback, useEffect, useState } from "react";

type SetupState =
  | { step: "idle" }
  | { step: "qr"; qrCode: string; manualKey: string }
  | { step: "confirming" };

export default function SecurityPage() {
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [setup, setSetup] = useState<SetupState>({ step: "idle" });
  const [enableCode, setEnableCode] = useState("");
  const [enableLoading, setEnableLoading] = useState(false);

  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.user) {
        setTotpEnabled(data.user.totpEnabled ?? false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  async function startSetup() {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Setup failed");
        return;
      }
      setSetup({
        step: "qr",
        qrCode: data.qrCode as string,
        manualKey: data.manualKey as string,
      });
    } catch {
      setError("Network error");
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnableLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: enableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Enable failed");
        return;
      }
      setMessage("2FA has been enabled.");
      setTotpEnabled(true);
      setSetup({ step: "idle" });
      setEnableCode("");
    } finally {
      setEnableLoading(false);
    }
  }

  async function disable2FA(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setDisableLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          code: disableCode,
          password: disablePassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Disable failed");
        return;
      }
      setMessage("2FA has been disabled.");
      setTotpEnabled(false);
      setDisableCode("");
      setDisablePassword("");
    } finally {
      setDisableLoading(false);
    }
  }

  if (loading) {
    return (
      <p className="text-slate-500">Loading…</p>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-white">Security</h1>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-green-500/30 bg-green-900/20 px-4 py-3 text-sm text-green-400">
          {message}
        </p>
      )}

      <section className="rounded-xl border border-white/10 bg-ink-900/50 p-6">
        <h2 className="text-lg font-medium text-white">
          Two-Factor Authentication
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {totpEnabled
            ? "2FA is currently enabled on your account."
            : "Add an extra layer of security with a TOTP authenticator app."}
        </p>

        {!totpEnabled && setup.step === "idle" && (
          <button
            type="button"
            onClick={() => void startSetup()}
            className="mt-4 rounded-lg bg-mint-600 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-mint-500"
          >
            Set up 2FA
          </button>
        )}

        {!totpEnabled && setup.step === "qr" && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-400">
              Scan this QR code with your authenticator app:
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qrCode}
              alt="2FA QR Code"
              className="mx-auto h-48 w-48"
            />
            <p className="text-xs text-slate-500">
              Or enter this key manually:{" "}
              <code className="rounded bg-ink-950 px-2 py-0.5 font-mono text-mint-400">
                {setup.manualKey}
              </code>
            </p>
            <form onSubmit={confirmEnable} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400">
                  Enter the 6-digit code from your app
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={enableCode}
                  onChange={(e) =>
                    setEnableCode(
                      e.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  className="mt-1 w-full max-w-xs rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-center font-mono text-lg tracking-[0.5em] outline-none ring-mint-500/40 focus:ring-2"
                  placeholder="000000"
                />
              </div>
              <button
                type="submit"
                disabled={enableLoading || enableCode.length !== 6}
                className="rounded-lg bg-mint-600 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-mint-500 disabled:opacity-50"
              >
                {enableLoading ? "Verifying…" : "Enable 2FA"}
              </button>
            </form>
          </div>
        )}

        {totpEnabled && (
          <form onSubmit={disable2FA} className="mt-4 space-y-3">
            <p className="text-sm text-slate-400">
              To disable 2FA, enter your password and a current authenticator code.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-400">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="mt-1 w-full max-w-xs rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none ring-mint-500/40 focus:ring-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">
                Authenticator code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={disableCode}
                onChange={(e) =>
                  setDisableCode(
                    e.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                className="mt-1 w-full max-w-xs rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-center font-mono text-lg tracking-[0.5em] outline-none ring-mint-500/40 focus:ring-2"
                placeholder="000000"
              />
            </div>
            <button
              type="submit"
              disabled={disableLoading || disableCode.length !== 6}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {disableLoading ? "Disabling…" : "Disable 2FA"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
