import crypto from "node:crypto";

/**
 * MPC Threshold Signing via Shamir's Secret Sharing (2-of-3).
 *
 * Splits a private key into 3 shares. Any 2 shares can reconstruct the key.
 * Arithmetic is performed over GF(256) for byte-level splitting.
 */

// GF(256) arithmetic using AES irreducible polynomial x^8 + x^4 + x^3 + x + 1
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);

(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x = x ^ (x << 1) ^ (x >= 128 ? 0x11b : 0);
    x &= 0xff;
  }
  EXP_TABLE[255] = EXP_TABLE[0];
})();

function gf256Mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255];
}

function gf256Div(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero in GF(256)");
  if (a === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] - LOG_TABLE[b] + 255) % 255];
}

export interface Share {
  x: number; // share index (1, 2, or 3)
  data: Buffer; // share bytes
}

/**
 * Split a secret into `n` shares with threshold `k` (k-of-n scheme).
 * Default: 2-of-3.
 */
export function splitSecret(secret: Buffer, k = 2, n = 3): Share[] {
  if (k > n) throw new Error("Threshold k must be <= n");
  if (k < 2) throw new Error("Threshold must be at least 2");
  if (n > 255) throw new Error("Max 255 shares");

  const shares: Share[] = Array.from({ length: n }, (_, i) => ({
    x: i + 1,
    data: Buffer.alloc(secret.length),
  }));

  for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
    // Generate random polynomial coefficients: a0 = secret byte, a1..a(k-1) = random
    const coeffs = new Uint8Array(k);
    coeffs[0] = secret[byteIdx];
    const rand = crypto.randomBytes(k - 1);
    for (let c = 1; c < k; c++) coeffs[c] = rand[c - 1];

    // Evaluate polynomial at x=1,2,...,n
    for (let i = 0; i < n; i++) {
      const x = i + 1;
      let y = 0;
      for (let c = k - 1; c >= 0; c--) {
        y = gf256Mul(y, x) ^ coeffs[c];
      }
      shares[i].data[byteIdx] = y;
    }
  }

  return shares;
}

/**
 * Reconstruct a secret from `k` shares using Lagrange interpolation in GF(256).
 */
export function reconstructSecret(shares: Share[]): Buffer {
  if (shares.length < 2) throw new Error("Need at least 2 shares");
  const len = shares[0].data.length;
  const result = Buffer.alloc(len);

  for (let byteIdx = 0; byteIdx < len; byteIdx++) {
    let secret = 0;
    for (let i = 0; i < shares.length; i++) {
      let lagrange = 1;
      for (let j = 0; j < shares.length; j++) {
        if (i === j) continue;
        // lagrange *= x_j / (x_j - x_i)
        const num = shares[j].x;
        const den = shares[j].x ^ shares[i].x; // XOR is subtraction in GF(256)
        lagrange = gf256Mul(lagrange, gf256Div(num, den));
      }
      secret ^= gf256Mul(shares[i].data[byteIdx], lagrange);
    }
    result[byteIdx] = secret;
  }

  return result;
}

export interface MpcKeyShares {
  shareId: string; // unique ID for this split operation
  threshold: number;
  totalShares: number;
  shares: { index: number; data: string }[]; // hex-encoded share data
}

/**
 * Split a hex-encoded private key into MPC shares.
 * Returns shares that would be distributed to separate custodians/servers.
 */
export function splitPrivateKey(privateKeyHex: string, threshold = 2, totalShares = 3): MpcKeyShares {
  const secret = Buffer.from(privateKeyHex, "hex");
  const shares = splitSecret(secret, threshold, totalShares);
  return {
    shareId: crypto.randomUUID(),
    threshold,
    totalShares,
    shares: shares.map((s) => ({ index: s.x, data: s.data.toString("hex") })),
  };
}

/**
 * Reconstruct a private key from threshold shares.
 */
export function reconstructPrivateKey(shares: { index: number; data: string }[]): string {
  const parsed: Share[] = shares.map((s) => ({
    x: s.index,
    data: Buffer.from(s.data, "hex"),
  }));
  return reconstructSecret(parsed).toString("hex");
}
