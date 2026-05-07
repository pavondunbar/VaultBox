"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
          <div className="rounded-2xl border border-white/10 bg-ink-900/80 p-8 shadow-xl backdrop-blur text-center">
            <p className="text-sm uppercase tracking-[0.2em] text-mint-400">
              VenCura
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              Email Verification
            </h1>
            <div className="mt-6">
              <p className="text-slate-400">Loading…</p>
            </div>
          </div>
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token provided.");
      return;
    }

    void (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setMessage(data.message ?? "Email verified successfully.");
        } else {
          setStatus("error");
          setMessage(data.error ?? "Verification failed.");
        }
      } catch {
        setStatus("error");
        setMessage("Network error. Please try again.");
      }
    })();
  }, [token]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-white/10 bg-ink-900/80 p-8 shadow-xl backdrop-blur text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-mint-400">
          VenCura
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          Email Verification
        </h1>

        <div className="mt-6">
          {status === "loading" && (
            <p className="text-slate-400">Verifying your email…</p>
          )}
          {status === "success" && (
            <p className="text-green-400">{message}</p>
          )}
          {status === "error" && (
            <p className="text-red-400">{message}</p>
          )}
        </div>

        <Link
          href="/dashboard"
          className="mt-6 inline-block text-sm text-mint-400 hover:underline"
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}
