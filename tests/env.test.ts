import { afterEach, describe, expect, it } from "vitest";
import { getJwtSecret } from "@/lib/env";

describe("getJwtSecret", () => {
  const prev = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.JWT_SECRET = prev;
  });

  it("throws when secret is too short", () => {
    process.env.JWT_SECRET = "short";
    expect(() => getJwtSecret()).toThrow();
  });

  it("returns the secret when long enough", () => {
    process.env.JWT_SECRET = "x".repeat(32);
    expect(getJwtSecret()).toBe("x".repeat(32));
  });
});
