"use client";

import { useCallback, useEffect, useState } from "react";

type Share = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

export function ShareManagement({ walletId }: { walletId: string }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [loadingShares, setLoadingShares] = useState(true);
  const [sharesError, setSharesError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">(
    "viewer",
  );
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    setLoadingShares(true);
    setSharesError(null);
    try {
      const res = await fetch(`/api/wallets/${walletId}/shares`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setSharesError(data.error ?? "Failed to load shares");
        return;
      }
      setShares(data.shares as Share[]);
    } catch {
      setSharesError("Failed to load shares");
    } finally {
      setLoadingShares(false);
    }
  }, [walletId]);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteLoading(true);
    try {
      const res = await fetch(`/api/wallets/${walletId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : "Failed to invite user";
        setInviteError(msg);
        return;
      }
      setShares((prev) => [...prev, data.share as Share]);
      setInviteEmail("");
      setInviteRole("viewer");
    } catch {
      setInviteError("Failed to invite user");
    } finally {
      setInviteLoading(false);
    }
  }

  async function revoke(shareId: string) {
    setDeletingId(shareId);
    try {
      const res = await fetch(
        `/api/wallets/${walletId}/shares/${shareId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSharesError(
          typeof data.error === "string"
            ? data.error
            : "Failed to revoke share",
        );
        return;
      }
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch {
      setSharesError("Failed to revoke share");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="lg:col-span-2 rounded-xl border border-white/10 bg-ink-900/50 p-6">
      <h2 className="text-lg font-medium text-white">Share management</h2>
      <p className="mt-1 text-xs text-slate-500">
        Invite other users to view or edit this wallet.
      </p>

      <form
        onSubmit={(e) => void invite(e)}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <input
          type="email"
          required
          placeholder="Email address"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          className="flex-1 rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint-500/40"
        />
        <select
          value={inviteRole}
          onChange={(e) =>
            setInviteRole(e.target.value as "viewer" | "editor")
          }
          className="rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint-500/40"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button
          type="submit"
          disabled={inviteLoading}
          className="rounded-lg bg-mint-600 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-mint-500 disabled:opacity-50"
        >
          {inviteLoading ? "Inviting…" : "Invite"}
        </button>
      </form>
      {inviteError && (
        <p className="mt-2 text-sm text-red-400">{inviteError}</p>
      )}

      <div className="mt-6 overflow-x-auto">
        {loadingShares ? (
          <p className="text-sm text-slate-500">Loading shares…</p>
        ) : sharesError ? (
          <p className="text-sm text-red-400">{sharesError}</p>
        ) : shares.length === 0 ? (
          <p className="text-sm text-slate-500">
            No shares yet. Invite someone above.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-500">
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Role</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {shares.map((s) => (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="py-2 pr-4 text-slate-300">{s.email}</td>
                  <td className="py-2 pr-4">
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                      {s.role}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={deletingId === s.id}
                      onClick={() => void revoke(s.id)}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      {deletingId === s.id ? "Revoking…" : "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
