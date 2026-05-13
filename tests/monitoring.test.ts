import { describe, it, expect } from "vitest";
import { metrics, collectMetrics } from "@/lib/monitoring/metrics";

describe("monitoring metrics", () => {
  it("increments counter and collects output", () => {
    metrics.httpRequestsTotal.inc({ method: "GET", path: "/api/health" });
    metrics.httpRequestsTotal.inc({ method: "GET", path: "/api/health" });
    const output = collectMetrics();
    expect(output).toContain("vencura_http_requests_total");
    expect(output).toContain('method="GET"');
  });

  it("records histogram observations", () => {
    metrics.httpRequestDuration.observe({ method: "POST" }, 0.05);
    metrics.httpRequestDuration.observe({ method: "POST" }, 0.2);
    const output = collectMetrics();
    expect(output).toContain("vencura_http_request_duration_seconds_sum");
    expect(output).toContain("vencura_http_request_duration_seconds_count");
  });

  it("tracks gauge values", () => {
    metrics.activeWallets.set({ chain: "ethereum" }, 42);
    const output = collectMetrics();
    expect(output).toContain("vencura_active_wallets");
    expect(output).toContain("42");
  });

  it("produces valid Prometheus text format", () => {
    const output = collectMetrics();
    // Should have HELP and TYPE lines
    expect(output).toContain("# HELP");
    expect(output).toContain("# TYPE");
  });
});
