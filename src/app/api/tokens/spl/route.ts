import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env";

const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

function getMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM,
  );
  return pda;
}

function parseMetadataSymbol(data: Buffer): string | null {
  // Metaplex metadata layout: skip first 1+32+32 = 65 bytes (key, update_authority, mint)
  // Then: name_len (4 bytes LE) + name (var) + symbol_len (4 bytes LE) + symbol (var)
  let offset = 65;
  const nameLen = data.readUInt32LE(offset);
  offset += 4 + nameLen;
  const symbolLen = data.readUInt32LE(offset);
  offset += 4;
  const symbol = data.subarray(offset, offset + symbolLen).toString("utf8").replace(/\0/g, "").trim();
  return symbol || null;
}

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mint = searchParams.get("mint");
  if (!mint) {
    return NextResponse.json({ error: "Missing mint" }, { status: 400 });
  }

  let mintPubkey: PublicKey;
  try {
    mintPubkey = new PublicKey(mint);
  } catch {
    return NextResponse.json({ error: "Invalid mint address" }, { status: 400 });
  }

  const env = getServerEnv();
  const conn = new Connection(env.SOL_RPC_URL, "confirmed");

  try {
    const mintInfo = await getMint(conn, mintPubkey);
    const decimals = mintInfo.decimals;

    // Try to read symbol from Metaplex metadata
    const metadataPDA = getMetadataPDA(mintPubkey);
    const metaAccount = await conn.getAccountInfo(metadataPDA);
    let symbol: string | null = null;
    if (metaAccount?.data) {
      symbol = parseMetadataSymbol(metaAccount.data as Buffer);
    }

    return NextResponse.json({ symbol: symbol ?? mint.slice(0, 6), decimals, mint });
  } catch {
    return NextResponse.json({ error: "Could not read mint" }, { status: 422 });
  }
}
