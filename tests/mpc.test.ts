import { describe, it, expect } from "vitest";
import { splitSecret, reconstructSecret, splitPrivateKey, reconstructPrivateKey } from "@/lib/crypto/mpc";
import crypto from "node:crypto";

describe("MPC - Shamir Secret Sharing", () => {
  it("splits and reconstructs with all 3 shares", () => {
    const secret = crypto.randomBytes(32);
    const shares = splitSecret(secret, 2, 3);
    expect(shares).toHaveLength(3);
    const recovered = reconstructSecret(shares);
    expect(recovered.equals(secret)).toBe(true);
  });

  it("reconstructs with any 2-of-3 shares", () => {
    const secret = crypto.randomBytes(32);
    const shares = splitSecret(secret, 2, 3);

    // shares [0,1]
    expect(reconstructSecret([shares[0], shares[1]]).equals(secret)).toBe(true);
    // shares [0,2]
    expect(reconstructSecret([shares[0], shares[2]]).equals(secret)).toBe(true);
    // shares [1,2]
    expect(reconstructSecret([shares[1], shares[2]]).equals(secret)).toBe(true);
  });

  it("fails with only 1 share (below threshold)", () => {
    const secret = crypto.randomBytes(32);
    const shares = splitSecret(secret, 2, 3);
    expect(() => reconstructSecret([shares[0]])).toThrow("Need at least 2 shares");
  });

  it("single share does not reveal the secret", () => {
    const secret = crypto.randomBytes(32);
    const shares = splitSecret(secret, 2, 3);
    expect(shares[0].data.equals(secret)).toBe(false);
  });

  it("splitPrivateKey / reconstructPrivateKey round-trip", () => {
    const keyHex = crypto.randomBytes(32).toString("hex");
    const mpc = splitPrivateKey(keyHex);
    expect(mpc.threshold).toBe(2);
    expect(mpc.totalShares).toBe(3);
    expect(mpc.shares).toHaveLength(3);

    // Reconstruct with shares 1 and 3
    const recovered = reconstructPrivateKey([mpc.shares[0], mpc.shares[2]]);
    expect(recovered).toBe(keyHex);
  });

  it("supports 3-of-5 threshold", () => {
    const secret = crypto.randomBytes(64);
    const shares = splitSecret(secret, 3, 5);
    expect(shares).toHaveLength(5);

    const recovered = reconstructSecret([shares[0], shares[2], shares[4]]);
    expect(recovered.equals(secret)).toBe(true);

    // 2 shares should NOT reconstruct correctly
    const wrong = reconstructSecret([shares[0], shares[1]]);
    expect(wrong.equals(secret)).toBe(false);
  });
});
