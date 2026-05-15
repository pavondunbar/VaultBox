import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchEthereumHistory } from "@/lib/chains/ethereum-history";

function etherscanResponse<T>(result: T[]) {
  return {
    ok: true,
    json: async () => ({ status: "1", result }),
  } as unknown as Response;
}

function etherscanEmpty() {
  return {
    ok: true,
    json: async () => ({ status: "0", result: "No transactions found" }),
  } as unknown as Response;
}

const WALLET = "0xAbC1230000000000000000000000000000000001";

describe("fetchEthereumHistory", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    // Suppress the "ETHERSCAN_API_KEY not set" warning in tests that exercise that path.
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes native ETH incoming transaction", async () => {
    const nativeTx = {
      hash: "0xaaa",
      from: "0xSender",
      to: WALLET,
      value: "1000000000000000000",
      isError: "0",
      timeStamp: "1700000000",
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(etherscanResponse([nativeTx]))
      .mockResolvedValueOnce(etherscanEmpty());

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchEthereumHistory(WALLET, "test-key");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      txHash: "0xaaa",
      fromAddress: "0xSender",
      toAddress: WALLET,
      amount: "1",
      tokenSymbol: "ETH",
      tokenAddress: null,
      direction: "incoming",
      kind: "receive",
    });
    expect(result[0].timestamp).toBeInstanceOf(Date);
  });

  it("normalizes native ETH outgoing transaction", async () => {
    const nativeTx = {
      hash: "0xbbb",
      from: WALLET,
      to: "0xReceiver",
      value: "500000000000000000",
      isError: "0",
      timeStamp: "1700000000",
    };

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(etherscanResponse([nativeTx]))
      .mockResolvedValueOnce(etherscanEmpty()));

    const result = await fetchEthereumHistory(WALLET, "key");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      direction: "outgoing",
      kind: "send",
      amount: "0.5",
    });
  });

  it("normalizes ERC-20 token transaction", async () => {
    const tokenTx = {
      hash: "0xccc",
      from: "0xSender",
      to: WALLET,
      value: "1000000",
      tokenSymbol: "USDC",
      contractAddress: "0xTokenAddr",
      tokenDecimal: "6",
      timeStamp: "1700000000",
    };

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(etherscanEmpty())
      .mockResolvedValueOnce(etherscanResponse([tokenTx])));

    const result = await fetchEthereumHistory(WALLET, "key");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      txHash: "0xccc",
      amount: "1",
      tokenSymbol: "USDC",
      tokenAddress: "0xTokenAddr",
      direction: "incoming",
      kind: "receive",
    });
  });

  it("skips failed transactions", async () => {
    const failedTx = {
      hash: "0xddd",
      from: WALLET,
      to: "0xReceiver",
      value: "1000000000000000000",
      isError: "1",
      timeStamp: "1700000000",
    };

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(etherscanResponse([failedTx]))
      .mockResolvedValueOnce(etherscanEmpty()));

    const result = await fetchEthereumHistory(WALLET, "key");
    expect(result).toHaveLength(0);
  });

  it("skips zero-value transactions", async () => {
    const zeroTx = {
      hash: "0xeee",
      from: "0xSender",
      to: WALLET,
      value: "0",
      isError: "0",
      timeStamp: "1700000000",
    };

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(etherscanResponse([zeroTx]))
      .mockResolvedValueOnce(etherscanEmpty()));

    const result = await fetchEthereumHistory(WALLET, "key");
    expect(result).toHaveLength(0);
  });

  it("returns empty on fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const result = await fetchEthereumHistory(WALLET, "key");
    expect(result).toEqual([]);
  });

  it("returns empty on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));

    const result = await fetchEthereumHistory(WALLET, "key");
    expect(result).toEqual([]);
  });

  it("returns empty without making any request when apiKey is null", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchEthereumHistory(WALLET, null);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Etherscan V2 endpoint with chainid for Sepolia", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(etherscanEmpty())
      .mockResolvedValueOnce(etherscanEmpty());

    vi.stubGlobal("fetch", fetchMock);

    await fetchEthereumHistory(WALLET, "my-api-key");

    const firstCallUrl = fetchMock.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain("https://api.etherscan.io/v2/api");
    expect(firstCallUrl).toContain("chainid=11155111");
    expect(firstCallUrl).toContain("apikey=my-api-key");
  });
});
