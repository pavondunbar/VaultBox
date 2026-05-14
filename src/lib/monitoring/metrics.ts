/**
 * Prometheus metrics via prom-client.
 *
 * Tracks HTTP request latency, transaction broadcasts, rate limit hits,
 * indexer performance, wallet operations, and approval queue depth.
 *
 * Metrics are exposed at GET /api/metrics in Prometheus text format.
 */

import client from "prom-client";

// Use a custom registry to avoid polluting the default
export const registry = new client.Registry();
registry.setDefaultLabels({ app: "vencura" });

// Collect default Node.js metrics (GC, event loop, memory)
client.collectDefaultMetrics({ register: registry });

export const metrics = {
  httpRequestsTotal: new client.Counter({
    name: "vencura_http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "path", "status"] as const,
    registers: [registry],
  }),

  httpRequestDuration: new client.Histogram({
    name: "vencura_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "path"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  }),

  httpErrors: new client.Counter({
    name: "vencura_http_errors_total",
    help: "HTTP error responses",
    labelNames: ["method", "path", "status"] as const,
    registers: [registry],
  }),

  txBroadcastTotal: new client.Counter({
    name: "vencura_tx_broadcast_total",
    help: "Transactions broadcast",
    labelNames: ["chain", "status"] as const,
    registers: [registry],
  }),

  txBroadcastErrors: new client.Counter({
    name: "vencura_tx_broadcast_errors_total",
    help: "Transaction broadcast failures",
    labelNames: ["chain"] as const,
    registers: [registry],
  }),

  rateLimitHits: new client.Counter({
    name: "vencura_rate_limit_hits_total",
    help: "Rate limit rejections",
    labelNames: ["category"] as const,
    registers: [registry],
  }),

  indexerTicksTotal: new client.Counter({
    name: "vencura_indexer_ticks_total",
    help: "Indexer poll ticks",
    labelNames: [] as const,
    registers: [registry],
  }),

  indexerTxProcessed: new client.Counter({
    name: "vencura_indexer_tx_processed_total",
    help: "Transactions detected by indexer",
    labelNames: ["chain"] as const,
    registers: [registry],
  }),

  indexerErrors: new client.Counter({
    name: "vencura_indexer_errors_total",
    help: "Indexer errors",
    labelNames: ["chain"] as const,
    registers: [registry],
  }),

  walletCreations: new client.Counter({
    name: "vencura_wallet_creations_total",
    help: "Wallets created",
    labelNames: ["chain"] as const,
    registers: [registry],
  }),

  activeWallets: new client.Gauge({
    name: "vencura_active_wallets",
    help: "Active wallet count",
    labelNames: ["chain"] as const,
    registers: [registry],
  }),

  approvalsPending: new client.Gauge({
    name: "vencura_approvals_pending",
    help: "Pending withdrawal approvals",
    labelNames: [] as const,
    registers: [registry],
  }),

  approvalsProcessed: new client.Counter({
    name: "vencura_approvals_processed_total",
    help: "Processed approvals",
    labelNames: ["result"] as const,
    registers: [registry],
  }),
};

/**
 * Collect all metrics in Prometheus text exposition format.
 */
export async function collectMetrics(): Promise<string> {
  return registry.metrics();
}
