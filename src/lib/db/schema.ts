import {
  boolean,
  index,
  integer,
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
    status: text("status").notNull().default("confirmed"), // pending, confirmed, failed
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
    index("tx_wallet_created_idx").on(table.walletId, table.createdAt),
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
    index("ledger_wallet_entry_idx").on(table.walletId, table.entryType),
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

export const rbfTransactions = pgTable("rbf_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  walletId: uuid("wallet_id")
    .references(() => wallets.id, { onDelete: "cascade" })
    .notNull(),
  originalTxHash: text("original_tx_hash").notNull(),
  replacementTxHash: text("replacement_tx_hash").notNull(),
  nonce: text("nonce").notNull(),
  originalGasPrice: text("original_gas_price").notNull(),
  newGasPrice: text("new_gas_price").notNull(),
  toAddress: text("to_address").notNull(),
  amount: text("amount").notNull(),
  tokenAddress: text("token_address"),
  status: text("status").notNull().default("pending"), // pending, confirmed, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  ip: text("ip"),
  metadata: text("metadata"), // JSON string for extra context
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    userId: uuid("user_id").notNull(),
    response: text("response").notNull(), // JSON string of the cached response
    statusCode: text("status_code").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_key_user_idx").on(table.key, table.userId),
  ],
);

export const walletBalances = pgTable(
  "wallet_balances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .references(() => wallets.id, { onDelete: "cascade" })
      .notNull(),
    chain: text("chain").notNull(),
    tokenSymbol: text("token_symbol"),
    tokenAddress: text("token_address"),
    balance: text("balance").notNull().default("0"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wallet_balances_wallet_token_idx").on(
      table.walletId,
      table.tokenAddress,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type WalletRow = typeof wallets.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type WalletShareRow = typeof walletShares.$inferSelect;
export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
export type RbfTransactionRow = typeof rbfTransactions.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
export type IdempotencyKeyRow = typeof idempotencyKeys.$inferSelect;
export type WalletBalanceRow = typeof walletBalances.$inferSelect;

// --- Hot/Cold Wallet Temperature ---

export const walletTemperature = pgTable(
  "wallet_temperature",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .references(() => wallets.id, { onDelete: "cascade" })
      .notNull(),
    temperature: text("temperature").notNull().default("hot"), // 'hot' or 'cold'
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wallet_temperature_wallet_idx").on(table.walletId),
  ],
);

// --- Withdrawal Approvals ---

export const withdrawalApprovals = pgTable(
  "withdrawal_approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .references(() => wallets.id, { onDelete: "cascade" })
      .notNull(),
    requesterId: uuid("requester_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    chain: text("chain").notNull(),
    toAddress: text("to_address").notNull(),
    amount: text("amount").notNull(),
    tokenAddress: text("token_address"),
    status: text("status").notNull().default("pending"), // pending, approved, rejected, expired
    requiredApprovals: integer("required_approvals").notNull().default(2),
    currentApprovals: integer("current_approvals").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("withdrawal_approvals_wallet_status_idx").on(table.walletId, table.status),
  ],
);

export const withdrawalVotes = pgTable(
  "withdrawal_votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    approvalId: uuid("approval_id")
      .references(() => withdrawalApprovals.id, { onDelete: "cascade" })
      .notNull(),
    voterId: uuid("voter_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    vote: text("vote").notNull(), // 'approve' or 'reject'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("withdrawal_votes_approval_voter_idx").on(table.approvalId, table.voterId),
  ],
);

// --- Indexer Cursors ---

export const indexerCursors = pgTable(
  "indexer_cursors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chain: text("chain").notNull(),
    cursor: text("cursor").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("indexer_cursors_chain_idx").on(table.chain),
  ],
);

export type WalletTemperatureRow = typeof walletTemperature.$inferSelect;
export type WithdrawalApprovalRow = typeof withdrawalApprovals.$inferSelect;
export type WithdrawalVoteRow = typeof withdrawalVotes.$inferSelect;
export type IndexerCursorRow = typeof indexerCursors.$inferSelect;
