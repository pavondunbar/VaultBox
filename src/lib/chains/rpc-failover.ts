import { withCircuitBreaker } from "./circuit-breaker";

/**
 * Parse a comma-separated list of RPC URLs from an env var value.
 * Falls back to a single-element array if no commas present.
 */
export function parseRpcUrls(envValue: string): string[] {
  return envValue
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

/**
 * Execute an async function against multiple RPC endpoints with failover.
 * Tries each URL in order; skips endpoints whose circuit breaker is open.
 * Returns the first successful result.
 */
export async function withRpcFailover<T>(
  urls: string[],
  fn: (url: string) => Promise<T>,
): Promise<T> {
  if (urls.length === 0) {
    throw new Error("No RPC URLs configured");
  }

  let lastError: Error | undefined;

  for (const url of urls) {
    try {
      return await withCircuitBreaker(url, () => fn(url));
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // If circuit is open, skip immediately to next URL
      continue;
    }
  }

  throw lastError ?? new Error("All RPC endpoints failed");
}

/**
 * Get the list of Ethereum RPC URLs from environment.
 * Supports comma-separated values: ETH_RPC_URL=https://a.io,https://b.io
 */
export function getEthRpcUrls(): string[] {
  const raw = process.env.ETH_RPC_URL ?? "";
  return parseRpcUrls(raw);
}

/**
 * Get the list of Solana RPC URLs from environment.
 * Supports comma-separated values: SOL_RPC_URL=https://a.io,https://b.io
 */
export function getSolRpcUrls(): string[] {
  const raw = process.env.SOL_RPC_URL ?? "https://api.devnet.solana.com";
  return parseRpcUrls(raw);
}
