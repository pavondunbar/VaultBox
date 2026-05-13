import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const env = getServerEnv();
  const client = createPublicClient({ chain: sepolia, transport: http(env.ETH_RPC_URL) });

  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: address as Address, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: address as Address, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return NextResponse.json({ symbol, decimals, address });
  } catch {
    return NextResponse.json({ error: "Could not read token contract" }, { status: 422 });
  }
}
