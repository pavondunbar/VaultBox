/**
 * SoftHSM Health Metrics
 *
 * Tracks operations, errors, and exposes health status.
 */
import type { HSMMetrics } from "./types";

export class MetricsCollector {
  private startTime = Date.now();
  private counters = {
    totalOps: 0,
    encryptOps: 0,
    decryptOps: 0,
    errors: 0,
    rateLimitHits: 0,
    accessDenials: 0,
  };
  private lastOpAt: string | null = null;
  private activeKeys = 0;
  private archivedKeys = 0;

  recordOp(type: "encrypt" | "decrypt"): void {
    this.counters.totalOps++;
    if (type === "encrypt") this.counters.encryptOps++;
    else this.counters.decryptOps++;
    this.lastOpAt = new Date().toISOString();
  }

  recordError(): void {
    this.counters.errors++;
  }

  recordRateLimit(): void {
    this.counters.rateLimitHits++;
  }

  recordAccessDenial(): void {
    this.counters.accessDenials++;
  }

  setKeyCount(active: number, archived: number): void {
    this.activeKeys = active;
    this.archivedKeys = archived;
  }

  getMetrics(): HSMMetrics {
    return {
      totalOperations: this.counters.totalOps,
      encryptOps: this.counters.encryptOps,
      decryptOps: this.counters.decryptOps,
      errors: this.counters.errors,
      rateLimitHits: this.counters.rateLimitHits,
      accessDenials: this.counters.accessDenials,
      activeKeys: this.activeKeys,
      archivedKeys: this.archivedKeys,
      uptimeMs: Date.now() - this.startTime,
      lastOperationAt: this.lastOpAt,
    };
  }

  /** Prometheus-compatible text format. */
  toPrometheus(): string {
    const m = this.getMetrics();
    return [
      `# HELP softhsm_operations_total Total HSM operations`,
      `# TYPE softhsm_operations_total counter`,
      `softhsm_operations_total{type="encrypt"} ${m.encryptOps}`,
      `softhsm_operations_total{type="decrypt"} ${m.decryptOps}`,
      `# HELP softhsm_errors_total Total HSM errors`,
      `# TYPE softhsm_errors_total counter`,
      `softhsm_errors_total ${m.errors}`,
      `# HELP softhsm_rate_limit_hits_total Rate limit rejections`,
      `# TYPE softhsm_rate_limit_hits_total counter`,
      `softhsm_rate_limit_hits_total ${m.rateLimitHits}`,
      `# HELP softhsm_access_denials_total Access control rejections`,
      `# TYPE softhsm_access_denials_total counter`,
      `softhsm_access_denials_total ${m.accessDenials}`,
      `# HELP softhsm_keys Active keys in the HSM`,
      `# TYPE softhsm_keys gauge`,
      `softhsm_keys{state="active"} ${m.activeKeys}`,
      `softhsm_keys{state="archived"} ${m.archivedKeys}`,
      `# HELP softhsm_uptime_seconds HSM uptime`,
      `# TYPE softhsm_uptime_seconds gauge`,
      `softhsm_uptime_seconds ${(m.uptimeMs / 1000).toFixed(1)}`,
    ].join("\n");
  }
}
