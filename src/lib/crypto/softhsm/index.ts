/**
 * SoftHSM Module Exports
 */
export { SoftHSM } from "./core";
export { AuditLog } from "./audit";
export { RateLimiter } from "./rate-limiter";
export { MetricsCollector } from "./metrics";
export { runSelfTests, enableFipsIfRequested, isFipsEnabled } from "./self-test";
export { splitMasterPassword, reconstructMasterPassword, splitSecret, reconstructSecret } from "./shamir";
export type { ShamirShare } from "./shamir";
export type * from "./types";

import { SoftHSM } from "./core";
import type { SoftHSMConfig } from "./types";

// --- Singleton ---
let instance: SoftHSM | null = null;

export function getSoftHSM(): SoftHSM {
  if (!instance) {
    const config: SoftHSMConfig = {
      storePath: process.env.SOFTHSM_KEYSTORE_PATH || "./softhsm-keystore.enc",
      masterPassword: process.env.SOFTHSM_MASTER_PASSWORD,
      auditLogPath: process.env.SOFTHSM_AUDIT_LOG_PATH,
      backupDir: process.env.SOFTHSM_BACKUP_DIR,
      callerSecret: process.env.SOFTHSM_CALLER_SECRET,
      sessionTimeoutMs: parseInt(process.env.SOFTHSM_SESSION_TIMEOUT_MS || "300000", 10),
    };

    // Support Shamir shares via comma-separated JSON
    if (!config.masterPassword && process.env.SOFTHSM_SHARES) {
      config.shares = process.env.SOFTHSM_SHARES.split(",");
    }

    instance = new SoftHSM(config);
  }
  return instance;
}

export function resetSoftHSM(): void {
  if (instance) instance.closeSession();
  instance = null;
}

// Cleanup on exit
process.on("exit", () => { if (instance) instance.closeSession(); });

/**
 * Drop-in replacements for vault.ts
 */
export function hsmEncryptSecret(plaintext: string, _keyHex?: string): string {
  const keyId = process.env.SOFTHSM_KEY_ID || "softhsm-master";
  return getSoftHSM().encrypt(keyId, plaintext);
}

export function hsmDecryptSecret(ciphertextB64: string, _keyHex?: string): string {
  const keyId = process.env.SOFTHSM_KEY_ID || "softhsm-master";
  return getSoftHSM().decrypt(keyId, ciphertextB64);
}
