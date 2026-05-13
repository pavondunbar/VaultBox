/**
 * Prometheus-compatible metrics collection.
 *
 * Exposes counters, gauges, and histograms for:
 * - HTTP request latency and status codes
 * - Transaction broadcasts (success/failure by chain)
 * - Rate limit hits
 * - Indexer performance
 * - Wallet operations
 *
 * Metrics are exposed at GET /api/metrics in Prometheus text format.
 */

type Labels = Record<string, string>;

class Counter {
  private values = new Map<string, number>();
  constructor(public readonly name: string, public readonly help: string) {}

  inc(labels: Labels = {}, value = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  collect(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [key, val] of this.values) {
      lines.push(`${this.name}${key} ${val}`);
    }
    return lines.join("\n");
  }
}

class Gauge {
  private values = new Map<string, number>();
  constructor(public readonly name: string, public readonly help: string) {}

  set(labels: Labels, value: number): void {
    this.values.set(labelKey(labels), value);
  }

  inc(labels: Labels = {}, value = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  dec(labels: Labels = {}, value = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) - value);
  }

  collect(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const [key, val] of this.values) {
      lines.push(`${this.name}${key} ${val}`);
    }
    return lines.join("\n");
  }
}

class Histogram {
  private counts = new Map<string, number>();
  private sums = new Map<string, number>();
  private buckets: number[];
  private bucketCounts = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  ) {
    this.buckets = buckets;
  }

  observe(labels: Labels, value: number): void {
    const key = labelKey(labels);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.sums.set(key, (this.sums.get(key) ?? 0) + value);
    for (const b of this.buckets) {
      const bKey = `${key}:le=${b}`;
      if (value <= b) {
        this.bucketCounts.set(bKey, (this.bucketCounts.get(bKey) ?? 0) + 1);
      }
    }
  }

  collect(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [key, count] of this.counts) {
      const sum = this.sums.get(key) ?? 0;
      for (const b of this.buckets) {
        const bKey = `${key}:le=${b}`;
        lines.push(`${this.name}_bucket${key.replace("}", `,le="${b}"`).replace("{", "{")} ${this.bucketCounts.get(bKey) ?? 0}`);
      }
      lines.push(`${this.name}_sum${key} ${sum}`);
      lines.push(`${this.name}_count${key} ${count}`);
    }
    return lines.join("\n");
  }
}

function labelKey(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
}

// --- Singleton metrics registry ---

export const metrics = {
  httpRequestsTotal: new Counter("vencura_http_requests_total", "Total HTTP requests"),
  httpRequestDuration: new Histogram("vencura_http_request_duration_seconds", "HTTP request duration"),
  httpErrors: new Counter("vencura_http_errors_total", "HTTP error responses"),

  txBroadcastTotal: new Counter("vencura_tx_broadcast_total", "Transactions broadcast"),
  txBroadcastErrors: new Counter("vencura_tx_broadcast_errors_total", "Transaction broadcast failures"),

  rateLimitHits: new Counter("vencura_rate_limit_hits_total", "Rate limit rejections"),

  indexerTicksTotal: new Counter("vencura_indexer_ticks_total", "Indexer poll ticks"),
  indexerTxProcessed: new Counter("vencura_indexer_tx_processed_total", "Transactions detected by indexer"),
  indexerErrors: new Counter("vencura_indexer_errors_total", "Indexer errors"),

  walletCreations: new Counter("vencura_wallet_creations_total", "Wallets created"),
  activeWallets: new Gauge("vencura_active_wallets", "Active wallet count"),

  approvalsPending: new Gauge("vencura_approvals_pending", "Pending withdrawal approvals"),
  approvalsProcessed: new Counter("vencura_approvals_processed_total", "Processed approvals"),
};

/**
 * Collect all metrics in Prometheus text exposition format.
 */
export function collectMetrics(): string {
  return [
    metrics.httpRequestsTotal.collect(),
    metrics.httpRequestDuration.collect(),
    metrics.httpErrors.collect(),
    metrics.txBroadcastTotal.collect(),
    metrics.txBroadcastErrors.collect(),
    metrics.rateLimitHits.collect(),
    metrics.indexerTicksTotal.collect(),
    metrics.indexerTxProcessed.collect(),
    metrics.indexerErrors.collect(),
    metrics.walletCreations.collect(),
    metrics.activeWallets.collect(),
    metrics.approvalsPending.collect(),
    metrics.approvalsProcessed.collect(),
  ].join("\n\n");
}
