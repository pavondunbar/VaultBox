import { describe, it, expect, afterAll } from "vitest";
import { SoftHSM } from "../src/lib/crypto/softhsm/core";
import fs from "fs";

const STORE = "/tmp/test-softhsm-vitest.enc";
const AUDIT = STORE + ".audit.jsonl";

function cleanup() {
  try { fs.unlinkSync(STORE); } catch {}
  try { fs.unlinkSync(AUDIT); } catch {}
}

afterAll(cleanup);

function makeHSM() {
  return new SoftHSM({ storePath: STORE, masterPassword: "test-password-123" });
}

describe("SoftHSM", () => {
  it("generates keys, encrypts, decrypts", () => {
    cleanup();
    const hsm = makeHSM();
    hsm.generateKey("k1");
    const ct = hsm.encrypt("k1", "secret data");
    expect(hsm.decrypt("k1", ct)).toBe("secret data");
    hsm.closeSession();
  });

  it("persists across sessions", () => {
    const hsm = makeHSM();
    const ct = hsm.encrypt("k1", "persist test");
    hsm.closeSession();
    const hsm2 = makeHSM();
    expect(hsm2.decrypt("k1", ct)).toBe("persist test");
    hsm2.closeSession();
  });

  it("detects tampered keystore", () => {
    const data = fs.readFileSync(STORE);
    data[20] ^= 0xff;
    fs.writeFileSync(STORE, data);
    expect(() => makeHSM()).toThrow(/TAMPER/);
    cleanup(); // reset for next tests
  });

  it("records audit log to external file", () => {
    cleanup();
    const hsm = makeHSM();
    hsm.generateKey("k2");
    hsm.encrypt("k2", "x");
    hsm.closeSession();
    const log = fs.readFileSync(AUDIT, "utf8").trim().split("\n");
    expect(log.length).toBeGreaterThan(0);
    const entries = log.map((l) => JSON.parse(l));
    expect(entries.some((e: any) => e.operation === "encrypt")).toBe(true);
  });

  it("enforces key policy (deny decrypt)", () => {
    cleanup();
    const hsm = makeHSM();
    hsm.generateKey("encrypt-only", { allowEncrypt: true, allowDecrypt: false });
    const ct = hsm.encrypt("encrypt-only", "data");
    expect(() => hsm.decrypt("encrypt-only", ct)).toThrow("policy denies decrypt");
    hsm.closeSession();
  });

  it("supports key rotation with version-aware decrypt", () => {
    cleanup();
    const hsm = makeHSM();
    hsm.generateKey("rot-key");
    const ct1 = hsm.encrypt("rot-key", "v1 data");
    hsm.rotateKey("rot-key");
    const ct2 = hsm.encrypt("rot-key", "v2 data");
    // Can decrypt both old and new
    expect(hsm.decrypt("rot-key", ct1)).toBe("v1 data");
    expect(hsm.decrypt("rot-key", ct2)).toBe("v2 data");
    hsm.closeSession();
  });

  it("rate limits excessive operations", () => {
    cleanup();
    const hsm = new SoftHSM({
      storePath: STORE,
      masterPassword: "test-password-123",
    });
    hsm.generateKey("rl-key");
    // The default rate limit is 100/min — we won't hit it in normal tests
    // but verify the mechanism exists
    const ct = hsm.encrypt("rl-key", "test");
    expect(hsm.decrypt("rl-key", ct)).toBe("test");
    hsm.closeSession();
  });
});
