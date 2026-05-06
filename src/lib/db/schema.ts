import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  chain: text("chain").notNull(),
  address: text("address").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  label: text("label"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .references(() => wallets.id, { onDelete: "cascade" })
      .notNull(),
    chain: text("chain").notNull(),
    txHash: text("tx_hash").notNull(),
    kind: text("kind").notNull(),
    toAddress: text("to_address").notNull(),
    fromAddress: text("from_address"),
    direction: text("direction").notNull().default("outgoing"),
    amount: text("amount").notNull(),
    tokenSymbol: text("token_symbol"),
    tokenAddress: text("token_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tx_wallet_direction_idx").on(
      table.txHash,
      table.walletId,
      table.direction,
    ),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    txHash: text("tx_hash").notNull(),
    walletId: uuid("wallet_id")
      .references(() => wallets.id, { onDelete: "cascade" })
      .notNull(),
    chain: text("chain").notNull(),
    entryType: text("entry_type").notNull(), // 'debit' or 'credit'
    amount: text("amount").notNull(),
    tokenSymbol: text("token_symbol"),
    tokenAddress: text("token_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ledger_tx_wallet_type_idx").on(
      table.txHash,
      table.walletId,
      table.entryType,
    ),
  ],
);

export const walletShares = pgTable(
  "wallet_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .references(() => wallets.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wallet_shares_wallet_user_idx").on(
      table.walletId,
      table.userId,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type WalletRow = typeof wallets.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type WalletShareRow = typeof walletShares.$inferSelect;
export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
