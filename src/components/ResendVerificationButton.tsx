"use client";

import { useState } from "react";

export function ResendVerificationButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );

  async function resend() {
    setStatus("loading");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setStatus("sent");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return <span className="text-xs text-green-400">Verification email sent!</span>;
  }

  return (
    <button
      type="button"
      onClick={() => void resend()}
      disabled={status === "loading"}
      className="text-xs font-medium text-amber-200 underline hover:text-amber-100 disabled:opacity-50"
    >
      {status === "loading" ? "Sending…" : "Resend verification email"}
    </button>
  );
}
