import { describe, it, expect, beforeEach } from "vitest";
import { metrics, collectMetrics, registry } from "@/lib/monitoring/metrics";

describe("monitoring metrics", () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  it("increments counter and collects output", async () => {
    metrics.httpRequestsTotal.inc({ method: "GET", path: "/api/health", status: "200" });
    metrics.httpRequestsTotal.inc({ method: "GET", path: "/api/health", status: "200" });
    const output = await collectMetrics();
    expect(output).toContain("vaultbox_http_requests_total");
    expect(output).toContain('method="GET"');
  });

  it("records histogram observations", async () => {
    metrics.httpRequestDuration.observe({ method: "POST", path: "/api/send" }, 0.05);
    metrics.httpRequestDuration.observe({ method: "POST", path: "/api/send" }, 0.2);
    const output = await collectMetrics();
    expect(output).toContain("vaultbox_http_request_duration_seconds_sum");
    expect(output).toContain("vaultbox_http_request_duration_seconds_count");
  });

  it("tracks gauge values", async () => {
    metrics.activeWallets.set({ chain: "ethereum" }, 42);
    const output = await collectMetrics();
    expect(output).toContain("vaultbox_active_wallets");
    expect(output).toContain("42");
  });

  it("produces valid Prometheus text format", async () => {
    const output = await collectMetrics();
    expect(output).toContain("# HELP");
    expect(output).toContain("# TYPE");
  });
});
