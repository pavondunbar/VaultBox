/**
 * Alerting system for anomalous activity.
 *
 * Supports multiple alert channels:
 * - Console (always active)
 * - Webhook (PagerDuty, Slack, etc.) via ALERT_WEBHOOK_URL
 *
 * Alert conditions:
 * - Large withdrawal detected
 * - Multiple failed transactions
 * - Rate limit spike
 * - Indexer falling behind
 * - Cold wallet access attempt
 */

export type AlertSeverity = "info" | "warning" | "critical";

export type Alert = {
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
};

type AlertHandler = (alert: Alert) => void | Promise<void>;

const handlers: AlertHandler[] = [];

// Always log to console
handlers.push((alert) => {
  const prefix = alert.severity === "critical" ? "🚨" : alert.severity === "warning" ? "⚠️" : "ℹ️";
  console.log(`[ALERT ${prefix}] ${alert.title}: ${alert.message}`, alert.metadata ?? "");
});

/**
 * Register a custom alert handler (e.g., webhook, email).
 */
export function onAlert(handler: AlertHandler): void {
  handlers.push(handler);
}

/**
 * Fire an alert to all registered handlers.
 */
export async function fireAlert(
  severity: AlertSeverity,
  title: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const alert: Alert = { severity, title, message, metadata, timestamp: new Date() };
  for (const h of handlers) {
    try { await h(alert); } catch { /* non-fatal */ }
  }

  // Webhook delivery
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alert),
      });
    } catch { /* non-fatal */ }
  }
}

// --- Pre-built alert triggers ---

export function alertLargeWithdrawal(chain: string, amount: string, walletId: string): Promise<void> {
  return fireAlert("warning", "Large Withdrawal", `${amount} ${chain} withdrawal from wallet ${walletId}`, { chain, amount, walletId });
}

export function alertFailedTransaction(chain: string, txHash: string, error: string): Promise<void> {
  return fireAlert("warning", "Transaction Failed", `${chain} tx ${txHash}: ${error}`, { chain, txHash, error });
}

export function alertColdWalletAccess(walletId: string, userId: string): Promise<void> {
  return fireAlert("critical", "Cold Wallet Access Attempt", `User ${userId} attempted automated access to cold wallet ${walletId}`, { walletId, userId });
}

export function alertIndexerBehind(chain: string, blocksBehind: number): Promise<void> {
  return fireAlert("warning", "Indexer Falling Behind", `${chain} indexer is ${blocksBehind} blocks behind`, { chain, blocksBehind });
}

export function alertRateLimitSpike(category: string, key: string): Promise<void> {
  return fireAlert("info", "Rate Limit Spike", `Repeated rate limit hits on ${category} from ${key}`, { category, key });
}
