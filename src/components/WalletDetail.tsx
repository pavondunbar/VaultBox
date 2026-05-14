"use client";

import { useCallback, useEffect, useState } from "react";
import { ShareManagement } from "@/components/ShareManagement";
import { SEPOLIA_ERC20_TOKENS } from "@/lib/tokens/erc20-presets";
import { DEVNET_SPL_TOKENS } from "@/lib/tokens/spl-presets";

type BalanceNativeEth = {
  chain: "ethereum";
  asset: "native";
  symbol: string;
  balance: string;
  wei: string;
};

type BalanceNativeSol = {
  chain: "solana";
  asset: "native";
  symbol: string;
  balance: string;
  lamports: number;
};

type BalanceNativeBtc = {
  chain: "bitcoin";
  asset: "native";
  symbol: string;
  balance: string;
  satoshis: number;
};

type BalanceResp = BalanceNativeEth | BalanceNativeSol | BalanceNativeBtc | Record<string, unknown>;

function explorerUrl(chain: string, txHash: string): string {
  if (chain === "ethereum") {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }
  if (chain === "bitcoin") {
    return `https://mempool.space/testnet/tx/${txHash}`;
  }
  return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
}

export function WalletDetail({
  walletId,
  chain,
  role = "owner",
}: {
  walletId: string;
  chain: "ethereum" | "solana" | "bitcoin";
  role?: "owner" | "editor" | "viewer";
}) {
  const canWrite = role !== "viewer";
  const [balance, setBalance] = useState<BalanceResp | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [tokenQuery, setTokenQuery] = useState("");
  const [loadingBal, setLoadingBal] = useState(true);

  // Custom imported tokens
  const [customTokens, setCustomTokens] = useState<{ symbol: string; address: string }[]>([]);
  const [importAddr, setImportAddr] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);

  async function importToken() {
    const addr = importAddr.trim();
    if (!addr) return;
    setImportErr(null);
    setImportLoading(true);
    try {
      const endpoint = chain === "ethereum"
        ? `/api/tokens/erc20?address=${encodeURIComponent(addr)}`
        : `/api/tokens/spl?mint=${encodeURIComponent(addr)}`;
      const res = await fetch(endpoint, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) { setImportErr(data.error ?? "Lookup failed"); return; }
      const key = chain === "ethereum" ? data.address : data.mint;
      if (customTokens.some((t) => t.address === key)) { setImportErr("Already imported"); return; }
      setCustomTokens((prev) => [...prev, { symbol: data.symbol, address: key }]);
      setImportAddr("");
    } catch { setImportErr("Lookup failed"); } finally { setImportLoading(false); }
  }

  const loadBalance = useCallback(async () => {
    setLoadingBal(true);
    setBalanceError(null);
    try {
      const q =
        chain === "ethereum"
          ? tokenQuery.trim()
            ? `?token=${encodeURIComponent(tokenQuery.trim())}`
            : ""
          : tokenQuery.trim()
            ? `?mint=${encodeURIComponent(tokenQuery.trim())}`
            : "";
      const res = await fetch(`/api/wallets/${walletId}/balance${q}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setBalanceError(data.error ?? "Failed to load balance");
        setBalance(null);
        return;
      }
      setBalance(data as BalanceResp);
    } catch {
      setBalanceError("Failed to load balance");
      setBalance(null);
    } finally {
      setLoadingBal(false);
    }
  }, [walletId, chain, tokenQuery]);

  useEffect(() => {
    void loadBalance();
    const id = setInterval(() => void loadBalance(), 15_000);
    return () => clearInterval(id);
  }, [loadBalance]);

  const [signMsg, setSignMsg] = useState("Hello from VenCura");
  const [signed, setSigned] = useState<string | null>(null);
  const [signErr, setSignErr] = useState<string | null>(null);
  const [signLoading, setSignLoading] = useState(false);

  async function sign() {
    setSignErr(null);
    setSigned(null);
    setSignLoading(true);
    try {
      const res = await fetch(`/api/wallets/${walletId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: signMsg }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSignErr(data.error ?? "Sign failed");
        return;
      }
      setSigned(data.signedMessage as string);
    } finally {
      setSignLoading(false);
    }
  }

  const [sendTo, setSendTo] = useState("");
  const [sendAmt, setSendAmt] = useState("");
  const [sendToken, setSendToken] = useState("");
  const [sendGasPrice, setSendGasPrice] = useState("");
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sendHash, setSendHash] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);

  async function send() {
    setSendErr(null);
    setSendHash(null);
    setSendLoading(true);
    try {
      const body: Record<string, string> = {
        to: sendTo.trim(),
        amount: sendAmt.trim(),
      };
      if (chain === "ethereum" && sendToken.trim()) {
        body.tokenAddress = sendToken.trim();
      }
      if (chain === "ethereum" && sendGasPrice.trim()) {
        body.gasPrice = sendGasPrice.trim();
      }
      if (chain === "solana" && sendToken.trim()) {
        body.mint = sendToken.trim();
      }
      const res = await fetch(`/api/wallets/${walletId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendErr(typeof data.error === "string" ? data.error : "Invalid amount or address");
        return;
      }
      setSendHash(data.transactionHash as string);
      void loadBalance();
      void loadTx();
    } finally {
      setSendLoading(false);
    }
  }

  const [walletsList, setWalletsList] = useState<
    { id: string; chain: string; address: string; label: string | null }[]
  >([]);
  const [xferTo, setXferTo] = useState("");
  const [xferAmt, setXferAmt] = useState("");
  const [xferToken, setXferToken] = useState("");
  const [xferErr, setXferErr] = useState<string | null>(null);
  const [xferHash, setXferHash] = useState<string | null>(null);
  const [xferLoading, setXferLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/wallets", { credentials: "include" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.wallets)) {
        setWalletsList(data.wallets);
      }
    })();
  }, []);

  async function transfer() {
    setXferErr(null);
    setXferHash(null);
    setXferLoading(true);
    try {
      const body: Record<string, string> = {
        toWalletId: xferTo,
        amount: xferAmt.trim(),
      };
      if (chain === "ethereum" && xferToken.trim()) {
        body.tokenAddress = xferToken.trim();
      }
      if (chain === "solana" && xferToken.trim()) {
        body.mint = xferToken.trim();
      }
      const res = await fetch(`/api/wallets/${walletId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setXferErr(typeof data.error === "string" ? data.error : "Transfer failed");
        return;
      }
      setXferHash(data.transactionHash as string);
      void loadBalance();
      void loadTx();
    } finally {
      setXferLoading(false);
    }
  }

  const [txRows, setTxRows] = useState<
    {
      id: string;
      txHash: string;
      kind: string;
      toAddress: string;
      fromAddress: string | null;
      direction: string;
      chain: string;
      amount: string;
      status: string;
      tokenSymbol: string | null;
      tokenAddress: string | null;
      createdAt: string;
    }[]
  >([]);

  const loadTx = useCallback(async () => {
    const res = await fetch(`/api/wallets/${walletId}/transactions`, {
      credentials: "include",
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.transactions)) {
      setTxRows(data.transactions);
    }
  }, [walletId]);

  useEffect(() => {
    void loadTx();
    const id = setInterval(() => void loadTx(), 15_000);
    return () => clearInterval(id);
  }, [loadTx]);

  const tokenLabel =
    chain === "ethereum"
      ? "ERC-20 contract (optional)"
      : chain === "solana"
        ? "SPL mint address (optional)"
        : "";

  const [rbfTarget, setRbfTarget] = useState<string | null>(null);
  const [rbfMaxFee, setRbfMaxFee] = useState("");
  const [rbfPriorityFee, setRbfPriorityFee] = useState("");
  const [rbfErr, setRbfErr] = useState<string | null>(null);
  const [rbfHash, setRbfHash] = useState<string | null>(null);
  const [rbfLoading, setRbfLoading] = useState(false);

  // Rename & Delete
  const [renameLabel, setRenameLabel] = useState("");
  const [renameErr, setRenameErr] = useState<string | null>(null);
  const [renameOk, setRenameOk] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  async function rename() {
    if (!renameLabel.trim()) return;
    setRenameErr(null); setRenameOk(false); setRenameLoading(true);
    try {
      const res = await fetch(`/api/wallets/${walletId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label: renameLabel.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setRenameErr(data.error ?? "Rename failed"); return; }
      setRenameOk(true);
    } finally { setRenameLoading(false); }
  }

  async function deleteWallet(force = false) {
    setDeleteLoading(true);
    setDeleteErr(null);
    try {
      const res = await fetch(`/api/wallets/${walletId}${force ? "?force=true" : ""}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) { window.location.href = "/dashboard"; return; }
      const data = await res.json();
      if (data.requiresConfirm) { setDeleteWarning(data.warning); }
      else { setDeleteErr(data.error ?? "Delete failed"); }
    } finally { setDeleteLoading(false); }
  }

  async function speedUp() {
    if (!rbfTarget) return;
    setRbfErr(null);
    setRbfHash(null);
    setRbfLoading(true);
    try {
      const res = await fetch(`/api/wallets/${walletId}/rbf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          originalTxHash: rbfTarget,
          maxFeePerGas: rbfMaxFee.trim(),
          maxPriorityFeePerGas: rbfPriorityFee.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRbfErr(data.error ?? "RBF failed");
        return;
      }
      setRbfHash(data.replacementTxHash as string);
      setRbfTarget(null);
      void loadTx();
    } finally {
      setRbfLoading(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="rounded-xl border border-white/10 bg-ink-900/50 p-6">
        <h2 className="text-lg font-medium text-white">Balance</h2>
        <p className="mt-1 text-xs text-slate-500">
          Leave token empty for native {chain === "ethereum" ? "ETH" : chain === "bitcoin" ? "BTC" : "SOL"}.
        </p>
        <div className="mt-4 flex flex-col flex-wrap gap-2 sm:flex-row">
          {chain === "ethereum" && (
            <select
              value={SEPOLIA_ERC20_TOKENS.find((t) => t.address === tokenQuery)?.address ?? ""}
              onChange={(e) => setTokenQuery(e.target.value)}
              className="rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-mint-500/40"
            >
              <option value="">Native ETH</option>
              {SEPOLIA_ERC20_TOKENS.map((t) => (
                <option key={t.address} value={t.address}>
                  {t.symbol} — {t.name}
                </option>
              ))}
              {customTokens.map((t) => (
                              <option key={t.address} value={t.address}>
                                {t.symbol} (imported)
                              </option>
                            ))}
                            <option value="custom">Custom address…</option>
            </select>
          )}
          {chain === "solana" && (
            <select
              value={DEVNET_SPL_TOKENS.find((t) => t.mint === tokenQuery)?.mint ?? ""}
              onChange={(e) => setTokenQuery(e.target.value)}
              className="rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-mint-500/40"
            >
              <option value="">Native SOL</option>
              {DEVNET_SPL_TOKENS.map((t) => (
                <option key={t.mint} value={t.mint}>
                  {t.symbol} — {t.name}
                </option>
              ))}
              {customTokens.map((t) => (
                              <option key={t.address} value={t.address}>
                                {t.symbol} (imported)
                              </option>
                            ))}
                            <option value="custom">Custom mint…</option>
            </select>
          )}
          <input
            type="text"
            placeholder={chain === "ethereum" ? "0x token…" : "Mint…"}
            value={tokenQuery}
            onChange={(e) => setTokenQuery(e.target.value)}
            className="flex-1 rounded-lg border border-white/10 bg-ink-950 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-mint-500/40"
          />
          <button
            type="button"
            onClick={() => void loadBalance()}
            disabled={loadingBal}
            className="shrink-0 rounded-lg border border-mint-600/50 px-4 py-2 text-xs text-mint-400 hover:bg-mint-600/10 disabled:opacity-50"
          >
            {loadingBal ? "Loading…" : "Refresh"}
          </button>
        </div>
        {chain !== "bitcoin" && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder={chain === "ethereum" ? "Import ERC-20 address (0x…)" : "Import SPL mint address…"}
              value={importAddr}
              onChange={(e) => setImportAddr(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-ink-950 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-mint-500/40"
            />
            <button
              type="button"
              disabled={importLoading || !importAddr.trim()}
              onClick={() => void importToken()}
              className="rounded-lg border border-mint-600/50 px-4 py-2 text-xs text-mint-400 hover:bg-mint-600/10 disabled:opacity-50"
            >
              {importLoading ? "Looking up…" : "Import"}
            </button>
          </div>
        )}
        {importErr && <p className="mt-1 text-xs text-red-400">{importErr}</p>}
        <div className="mt-4 min-h-[4rem]">
          {loadingBal ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : balanceError ? (
            <p className="text-sm text-red-400">{balanceError}</p>
          ) : balance && "balance" in balance ? (
            <div className="space-y-1">
              <p className="text-3xl font-semibold text-white">
                {(balance as { balance: string }).balance}
              </p>
              <p className="text-xs text-slate-500">
                {chain === "ethereum" &&
                  balance.asset === "native" &&
                  `Wei: ${(balance as BalanceNativeEth).wei}`}
                {chain === "solana" &&
                  balance.asset === "native" &&
                  `Lamports: ${(balance as BalanceNativeSol).lamports}`}
                {chain === "bitcoin" &&
                  balance.asset === "native" &&
                  `Satoshis: ${(balance as BalanceNativeBtc).satoshis}`}
                {balance.asset === "token" && "decimals" in balance && (
                  <>Decimals: {String((balance as { decimals: number }).decimals)}</>
                )}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No data</p>
          )}
        </div>
      </section>

      {canWrite && <section className="rounded-xl border border-white/10 bg-ink-900/50 p-6">
        <h2 className="text-lg font-medium text-white">Sign message</h2>
        <textarea
          value={signMsg}
          onChange={(e) => setSignMsg(e.target.value)}
          rows={3}
          className="mt-4 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint-500/40"
        />
        <button
          type="button"
          disabled={signLoading}
          onClick={() => void sign()}
          className="mt-3 rounded-lg bg-mint-600 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-mint-500 disabled:opacity-50"
        >
          {signLoading ? "Signing…" : "Sign"}
        </button>
        {signErr && (
          <p className="mt-2 text-sm text-red-400">{signErr}</p>
        )}
        {signed && (
          <p className="mt-3 font-mono text-xs text-slate-400 break-all">
            {signed}
          </p>
        )}
      </section>}

      {canWrite && <section className="rounded-xl border border-white/10 bg-ink-900/50 p-6">
        <h2 className="text-lg font-medium text-white">Send on-chain</h2>
        <div className="mt-4 space-y-3">
          <input
            type="text"
            placeholder={chain === "ethereum" ? "To address (0x…)" : "To address"}
            value={sendTo}
            onChange={(e) => setSendTo(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-mint-500/40"
          />
          <input
            type="text"
            placeholder="Amount"
            value={sendAmt}
            onChange={(e) => setSendAmt(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint-500/40"
          />
          {chain !== "bitcoin" && (
            <>
              {chain === "ethereum" && (
                <select
                  value={SEPOLIA_ERC20_TOKENS.find((t) => t.address === sendToken)?.address ?? ""}
                  onChange={(e) => setSendToken(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-mint-500/40"
                >
                  <option value="">Native ETH (no token)</option>
                  {SEPOLIA_ERC20_TOKENS.map((t) => (
                    <option key={t.address} value={t.address}>
                      {t.symbol} — {t.name}
                    </option>
                  ))}
                  {customTokens.map((t) => (
                                  <option key={t.address} value={t.address}>
                                    {t.symbol} (imported)
                                  </option>
                                ))}
                                <option value="custom">Custom address…</option>
                </select>
              )}
              {chain === "solana" && (
                <select
                  value={DEVNET_SPL_TOKENS.find((t) => t.mint === sendToken)?.mint ?? ""}
                  onChange={(e) => setSendToken(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-mint-500/40"
                >
                  <option value="">Native SOL (no token)</option>
                  {DEVNET_SPL_TOKENS.map((t) => (
                    <option key={t.mint} value={t.mint}>
                      {t.symbol} — {t.name}
                    </option>
                  ))}
                  {customTokens.map((t) => (
                                  <option key={t.address} value={t.address}>
                                    {t.symbol} (imported)
                                  </option>
                                ))}
                                <option value="custom">Custom mint…</option>
                </select>
              )}
              <input
                type="text"
                placeholder={tokenLabel}
                value={sendToken}
                onChange={(e) => setSendToken(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-mint-500/40"
              />
            </>
          )}
          {chain === "ethereum" && (
            <input
              type="text"
              placeholder="Gas price in Gwei (optional — sets initial gas)"
              value={sendGasPrice}
              onChange={(e) => setSendGasPrice(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint-500/40"
            />
          )}
          <button
            type="button"
            disabled={sendLoading}
            onClick={() => void send()}
            className="rounded-lg bg-mint-600 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-mint-500 disabled:opacity-50"
          >
            {sendLoading ? "Sending…" : "Send"}
          </button>
          {sendErr && (
            <p className="text-sm text-red-400">{sendErr}</p>
          )}
          {sendHash && (
            <p className="font-mono text-xs text-mint-400 break-all">
              Tx: {sendHash}
            </p>
          )}
        </div>
      </section>}

      {canWrite && <section className="rounded-xl border border-white/10 bg-ink-900/50 p-6">
        <h2 className="text-lg font-medium text-white">
          Transfer to your wallet
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Sends on-chain to another wallet you own (same chain).
        </p>
        <div className="mt-4 space-y-3">
          <select
            value={xferTo}
            onChange={(e) => setXferTo(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint-500/40"
          >
            <option value="">Select destination…</option>
            {walletsList
              .filter((w) => w.id !== walletId && w.chain === chain)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {(w.label ?? w.chain) + " — " + w.address.slice(0, 8) + "…"}
                </option>
              ))}
          </select>
          <input
            type="text"
            placeholder="Amount"
            value={xferAmt}
            onChange={(e) => setXferAmt(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint-500/40"
          />
          {chain !== "bitcoin" && (
            <>
              {chain === "ethereum" && (
                <select
                  value={SEPOLIA_ERC20_TOKENS.find((t) => t.address === xferToken)?.address ?? ""}
                  onChange={(e) => setXferToken(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-mint-500/40"
                >
                  <option value="">Native ETH (no token)</option>
                  {SEPOLIA_ERC20_TOKENS.map((t) => (
                    <option key={t.address} value={t.address}>
                      {t.symbol} — {t.name}
                    </option>
                  ))}
                  {customTokens.map((t) => (
                                  <option key={t.address} value={t.address}>
                                    {t.symbol} (imported)
                                  </option>
                                ))}
                                <option value="custom">Custom address…</option>
                </select>
              )}
              {chain === "solana" && (
                <select
                  value={DEVNET_SPL_TOKENS.find((t) => t.mint === xferToken)?.mint ?? ""}
                  onChange={(e) => setXferToken(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-mint-500/40"
                >
                  <option value="">Native SOL (no token)</option>
                  {DEVNET_SPL_TOKENS.map((t) => (
                    <option key={t.mint} value={t.mint}>
                      {t.symbol} — {t.name}
                    </option>
                  ))}
                  {customTokens.map((t) => (
                                  <option key={t.address} value={t.address}>
                                    {t.symbol} (imported)
                                  </option>
                                ))}
                                <option value="custom">Custom mint…</option>
                </select>
              )}
              <input
                type="text"
                placeholder={tokenLabel}
                value={xferToken}
                onChange={(e) => setXferToken(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-mint-500/40"
              />
            </>
          )}
          <button
            type="button"
            disabled={xferLoading || !xferTo}
            onClick={() => void transfer()}
            className="rounded-lg bg-mint-600 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-mint-500 disabled:opacity-50"
          >
            {xferLoading ? "Transferring…" : "Transfer"}
          </button>
          {xferErr && (
            <p className="text-sm text-red-400">{xferErr}</p>
          )}
          {xferHash && (
            <p className="font-mono text-xs text-mint-400 break-all">
              Tx: {xferHash}
            </p>
          )}
        </div>
      </section>}

      <section className="lg:col-span-2 rounded-xl border border-white/10 bg-ink-900/50 p-6">
        <h2 className="text-lg font-medium text-white">Transaction history</h2>
        <p className="mt-1 text-xs text-slate-500">
          Transactions recorded by VenCura for this wallet.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-500">
                <th className="pb-2 pr-4 font-medium">Direction</th>
                <th className="pb-2 pr-4 font-medium">Kind</th>
                <th className="pb-2 pr-4 font-medium">To/From</th>
                <th className="pb-2 pr-4 font-medium">Amount</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Tx</th>
              </tr>
            </thead>
            <tbody>
              {txRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-slate-500">
                    No transactions yet.
                  </td>
                </tr>
              ) : (
                txRows.map((t) => (
                  <tr key={t.id} className="border-b border-white/5">
                    <td className="py-2 pr-4">
                      <span
                        className={
                          t.direction === "incoming"
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        {t.direction === "incoming" ? "Received" : "Sent"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-300">{t.kind}</td>
                    <td className="max-w-[180px] truncate py-2 pr-4 font-mono text-xs text-slate-400">
                      {t.direction === "incoming"
                        ? t.fromAddress ?? "—"
                        : t.toAddress}
                    </td>
                    <td className="py-2 pr-4">{t.amount}</td>
                    <td className="py-2 pr-4">
                      <span className={
                        t.status === "confirmed" ? "text-green-400" :
                        t.status === "failed" ? "text-red-400" :
                        "text-yellow-400"
                      }>
                        {t.status ?? "confirmed"}
                      </span>
                      {canWrite && chain === "ethereum" && t.status === "pending" && t.direction === "outgoing" && (
                        <button
                          type="button"
                          onClick={() => { setRbfTarget(t.txHash); setRbfErr(null); setRbfHash(null); }}
                          className="ml-2 text-xs text-amber-400 hover:text-amber-300 underline"
                        >
                          Speed Up
                        </button>
                      )}
                    </td>
                    <td className="py-2 font-mono text-xs">
                      <a
                        href={explorerUrl(t.chain, t.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-mint-400/90 hover:text-mint-300 hover:underline"
                      >
                        {t.txHash.slice(0, 16)}…
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {rbfTarget && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 space-y-3">
            <h3 className="text-sm font-medium text-amber-400">Speed Up Transaction (RBF)</h3>
            <p className="text-xs text-slate-400">
              Replace pending tx <span className="font-mono">{rbfTarget.slice(0, 20)}…</span> with higher gas fees (in wei).
            </p>
            <input
              type="text"
              placeholder="Max fee per gas (wei) — e.g. 30000000000 for 30 Gwei"
              value={rbfMaxFee}
              onChange={(e) => setRbfMaxFee(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <input
              type="text"
              placeholder="Max priority fee per gas (wei) — e.g. 2000000000 for 2 Gwei"
              value={rbfPriorityFee}
              onChange={(e) => setRbfPriorityFee(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={rbfLoading || !rbfMaxFee.trim() || !rbfPriorityFee.trim()}
                onClick={() => void speedUp()}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-amber-500 disabled:opacity-50"
              >
                {rbfLoading ? "Replacing…" : "Replace Transaction"}
              </button>
              <button
                type="button"
                onClick={() => setRbfTarget(null)}
                className="rounded-lg border border-white/15 px-4 py-2 text-xs text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
            {rbfErr && <p className="text-sm text-red-400">{rbfErr}</p>}
            {rbfHash && <p className="font-mono text-xs text-mint-400 break-all">Replacement tx: {rbfHash}</p>}
          </div>
        )}
      </section>

      {role === "owner" && <ShareManagement walletId={walletId} />}

      {role === "owner" && (
        <section className="rounded-xl border border-white/10 bg-ink-900/50 p-6">
          <h2 className="text-lg font-medium text-white">Manage Wallet</h2>

          <div className="mt-4 space-y-3">
            <label className="block text-xs text-slate-400">Rename wallet</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New label"
                value={renameLabel}
                onChange={(e) => setRenameLabel(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-mint-500/40"
              />
              <button
                type="button"
                disabled={renameLoading || !renameLabel.trim()}
                onClick={() => void rename()}
                className="rounded-lg bg-mint-600 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-mint-500 disabled:opacity-50"
              >
                {renameLoading ? "Saving…" : "Rename"}
              </button>
            </div>
            {renameErr && <p className="text-xs text-red-400">{renameErr}</p>}
            {renameOk && <p className="text-xs text-green-400">Label updated! Refresh to see changes.</p>}
          </div>

          <div className="mt-6 border-t border-white/10 pt-4">
            <label className="block text-xs text-red-400">Danger zone</label>
            {!deleteConfirm && !deleteWarning ? (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="mt-2 rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
              >
                Delete Wallet
              </button>
            ) : deleteWarning ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-amber-400">⚠️ {deleteWarning}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deleteLoading}
                    onClick={() => void deleteWallet(true)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {deleteLoading ? "Deleting…" : "Delete Anyway"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDeleteWarning(null); setDeleteConfirm(false); }}
                    className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-red-300">Are you sure? This cannot be undone.</span>
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={() => void deleteWallet()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {deleteLoading ? "Deleting…" : "Confirm Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            )}
            {deleteErr && <p className="mt-2 text-xs text-red-400">{deleteErr}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
