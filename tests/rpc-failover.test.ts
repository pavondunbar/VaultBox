import { describe, it, expect, beforeEach } from "vitest";
import {
  withCircuitBreaker,
  resetCircuit,
  getCircuitState,
} from "@/lib/chains/circuit-breaker";
import { parseRpcUrls, withRpcFailover } from "@/lib/chains/rpc-failover";

describe("circuit breaker", () => {
  beforeEach(() => {
    resetCircuit("test");
  });

  it("passes through on success", async () => {
    const result = await withCircuitBreaker("test", async () => "ok");
    expect(result).toBe("ok");
    expect(getCircuitState("test")).toBe("closed");
  });

  it("opens after reaching failure threshold", async () => {
    const fail = () => withCircuitBreaker("test", async () => { throw new Error("fail"); }, { failureThreshold: 3 });

    await expect(fail()).rejects.toThrow("fail");
    await expect(fail()).rejects.toThrow("fail");
    await expect(fail()).rejects.toThrow("fail");

    expect(getCircuitState("test")).toBe("open");
    await expect(fail()).rejects.toThrow("Circuit breaker OPEN for test");
  });

  it("resets to closed on success after half_open", async () => {
    const fail = () => withCircuitBreaker("test", async () => { throw new Error("fail"); }, { failureThreshold: 2, resetTimeoutMs: 0 });

    await expect(fail()).rejects.toThrow();
    await expect(fail()).rejects.toThrow();
    expect(getCircuitState("test")).toBe("open");

    // With resetTimeoutMs=0, next call transitions to half_open and succeeds
    const result = await withCircuitBreaker("test", async () => "recovered", { failureThreshold: 2, resetTimeoutMs: 0 });
    expect(result).toBe("recovered");
    expect(getCircuitState("test")).toBe("closed");
  });
});

describe("parseRpcUrls", () => {
  it("parses comma-separated URLs", () => {
    expect(parseRpcUrls("https://a.io,https://b.io")).toEqual(["https://a.io", "https://b.io"]);
  });

  it("handles single URL", () => {
    expect(parseRpcUrls("https://a.io")).toEqual(["https://a.io"]);
  });

  it("trims whitespace", () => {
    expect(parseRpcUrls(" https://a.io , https://b.io ")).toEqual(["https://a.io", "https://b.io"]);
  });

  it("filters empty strings", () => {
    expect(parseRpcUrls("https://a.io,,")).toEqual(["https://a.io"]);
  });
});

describe("withRpcFailover", () => {
  beforeEach(() => {
    resetCircuit("url1");
    resetCircuit("url2");
    resetCircuit("url3");
  });

  it("returns result from first successful URL", async () => {
    const result = await withRpcFailover(["url1", "url2"], async (url) => `result-${url}`);
    expect(result).toBe("result-url1");
  });

  it("falls back to second URL on first failure", async () => {
    let calls = 0;
    const result = await withRpcFailover(["url1", "url2"], async (url) => {
      calls++;
      if (url === "url1") throw new Error("down");
      return `result-${url}`;
    });
    expect(result).toBe("result-url2");
    expect(calls).toBe(2);
  });

  it("throws last error when all URLs fail", async () => {
    await expect(
      withRpcFailover(["url1", "url2"], async () => { throw new Error("all down"); }),
    ).rejects.toThrow("all down");
  });

  it("throws on empty URL list", async () => {
    await expect(
      withRpcFailover([], async () => "x"),
    ).rejects.toThrow("No RPC URLs configured");
  });
});
