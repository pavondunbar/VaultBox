import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("secret-one");
    expect(await verifyPassword("secret-two", hash)).toBe(false);
  });

  it("produces different hashes for the same password (salt)", async () => {
    const h1 = await hashPassword("same-input");
    const h2 = await hashPassword("same-input");
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("same-input", h1)).toBe(true);
    expect(await verifyPassword("same-input", h2)).toBe(true);
  });
});
