/**
 * VaultBox API usage sketch (TypeScript).
 *
 * After you log in via the browser, copy the `vaultbox_token` cookie value and:
 *
 *   export VAULTBOX_COOKIE='vaultbox_token=<jwt>; Path=/; HttpOnly'
 *
 * Or pass only the cookie pair:
 *
 *   export VAULTBOX_COOKIE='vaultbox_token=eyJhbGciOi...'
 *
 * Then call helpers below from a script or REPL (same origin / BASE_URL).
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

function cookieHeader(): string {
  const c = process.env.VAULTBOX_COOKIE?.trim();
  if (!c) {
    throw new Error("Set VAULTBOX_COOKIE to your session cookie string");
  }
  return c.startsWith("vaultbox_token=") ? c : `vaultbox_token=${c}`;
}

export async function listWallets() {
  const res = await fetch(`${BASE}/api/wallets`, {
    headers: { Cookie: cookieHeader() },
  });
  return res.json();
}

export async function getBalance(walletId: string, opts?: { token?: string; mint?: string }) {
  const q =
    opts?.token != null
      ? `?token=${encodeURIComponent(opts.token)}`
      : opts?.mint != null
        ? `?mint=${encodeURIComponent(opts.mint)}`
        : "";
  const res = await fetch(`${BASE}/api/wallets/${walletId}/balance${q}`, {
    headers: { Cookie: cookieHeader() },
  });
  return res.json();
}

export async function signMessage(walletId: string, message: string) {
  const res = await fetch(`${BASE}/api/wallets/${walletId}/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(),
    },
    body: JSON.stringify({ message }),
  });
  return res.json();
}

export async function sendTransaction(
  walletId: string,
  body: {
    to: string;
    amount: string;
    tokenAddress?: string;
    mint?: string;
  },
) {
  const res = await fetch(`${BASE}/api/wallets/${walletId}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}
