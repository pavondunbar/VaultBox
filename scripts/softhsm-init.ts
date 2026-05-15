#!/usr/bin/env tsx
/**
 * Initialize the SoftHSM keystore.
 *
 * Usage: npx tsx scripts/softhsm-init.ts
 * Or:    make softhsm-init
 */
import { SoftHSM } from "../src/lib/crypto/softhsm/core";
import { splitMasterPassword } from "../src/lib/crypto/softhsm/shamir";

const password = process.env.SOFTHSM_MASTER_PASSWORD;
const storePath = process.env.SOFTHSM_KEYSTORE_PATH || "./softhsm-keystore.enc";
const keyId = process.env.SOFTHSM_KEY_ID || "softhsm-master";
const splitShares = process.argv.includes("--split");

if (!password) {
  console.error("Error: SOFTHSM_MASTER_PASSWORD environment variable is required.");
  process.exit(1);
}

const hsm = new SoftHSM({ storePath, masterPassword: password });

if (hsm.hasKey(keyId)) {
  console.log(`✓ SoftHSM key '${keyId}' already exists in ${storePath}`);
} else {
  hsm.generateKey(keyId);
  console.log(`✓ Generated SoftHSM key '${keyId}' in ${storePath}`);
}

hsm.closeSession();

console.log(`\nSoftHSM is ready. Ensure these are in your .env:\n`);
console.log(`  SOFTHSM_MASTER_PASSWORD="${password}"`);
console.log(`  SOFTHSM_KEYSTORE_PATH="${storePath}"`);
console.log(`  SOFTHSM_KEY_ID="${keyId}"`);

// Optional: split master password into shares for ceremony-based unlock
if (splitShares) {
  const k = parseInt(process.env.SOFTHSM_THRESHOLD || "2", 10);
  const n = parseInt(process.env.SOFTHSM_SHARES_COUNT || "3", 10);
  const shares = splitMasterPassword(password, k, n);
  console.log(`\n--- ${k}-of-${n} Shamir Shares (distribute to operators) ---`);
  for (const s of shares) {
    console.log(`  Share ${s.index}: ${JSON.stringify(s)}`);
  }
  console.log(`\nTo unlock with shares, set SOFTHSM_SHARES (comma-separated JSON).`);
}
