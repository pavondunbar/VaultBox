import { describe, expect, it } from "vitest";
import {
  signSessionToken,
  verifySessionToken,
} from "@/lib/auth/jwt";

const SECRET = "unit-test-jwt-secret-string-32ch";

describe("session JWT", () => {
  it("signs and verifies payload", async () => {
    const token = await signSessionToken(
      { sub: "user-1", email: "a@b.co" },
      SECRET,
    );
    const payload = await verifySessionToken(token, SECRET);
    expect(payload).toEqual({ sub: "user-1", email: "a@b.co" });
  });

  it("returns null for wrong secret", async () => {
    const token = await signSessionToken(
      { sub: "user-1", email: "a@b.co" },
      SECRET,
    );
    const payload = await verifySessionToken(token, SECRET + "x");
    expect(payload).toBeNull();
  });

  it("returns null for malformed token", async () => {
    const payload = await verifySessionToken("not-a-jwt", SECRET);
    expect(payload).toBeNull();
  });

  it("returns null for empty token", async () => {
    const payload = await verifySessionToken("", SECRET);
    expect(payload).toBeNull();
  });

  it("returns null when signature is corrupted", async () => {
    const token = await signSessionToken(
      { sub: "user-1", email: "a@b.co" },
      SECRET,
    );
    const corrupted = token.slice(0, -4) + "xxxx";
    const payload = await verifySessionToken(corrupted, SECRET);
    expect(payload).toBeNull();
  });
});
