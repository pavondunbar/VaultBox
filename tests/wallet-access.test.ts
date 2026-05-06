import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

const { hasMinRole } = await import("@/lib/wallets/access");
type WalletRole = "owner" | "editor" | "viewer";

describe("hasMinRole", () => {
  const cases: [WalletRole, WalletRole, boolean][] = [
    ["owner", "owner", true],
    ["owner", "editor", true],
    ["owner", "viewer", true],
    ["editor", "owner", false],
    ["editor", "editor", true],
    ["editor", "viewer", true],
    ["viewer", "owner", false],
    ["viewer", "editor", false],
    ["viewer", "viewer", true],
  ];

  for (const [actual, required, expected] of cases) {
    it(`${actual} ${expected ? ">=" : "<"} ${required}`, () => {
      expect(hasMinRole(actual, required)).toBe(expected);
    });
  }
});
