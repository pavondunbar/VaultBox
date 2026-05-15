/**
 * SoftHSM — Re-exports from the softhsm module.
 *
 * This file maintains backward compatibility with existing imports.
 */
export {
  SoftHSM,
  getSoftHSM,
  resetSoftHSM,
  hsmEncryptSecret,
  hsmDecryptSecret,
  AuditLog,
  RateLimiter,
  MetricsCollector,
  runSelfTests,
  splitMasterPassword,
  reconstructMasterPassword,
} from "./softhsm";

export { SoftHSMClient } from "./softhsm/client";
