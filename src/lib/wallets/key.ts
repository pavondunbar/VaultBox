import { decryptSecret } from "@/lib/crypto/vault";
import type { WalletRow } from "@/lib/db/schema";

export function unlockWalletKey(
  row: WalletRow,
  encryptionKeyHex: string,
): string {
  return decryptSecret(row.encryptedPrivateKey, encryptionKeyHex);
}
