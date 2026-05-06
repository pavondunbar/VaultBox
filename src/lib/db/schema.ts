import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  walletId: uuid("wallet_id")
    .references(() => wallets.id, { onDelete: "cascade" })
    .notNull(),
  chain: text("chain").notNull(),
  txHash: text("tx_hash").notNull(),
  kind: text("kind").notNull(),
  toAddress: text("to_address").notNull(),
  amount: text("amount").notNull(),
  tokenSymbol: text("token_symbol"),
  tokenAddress: text("token_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type WalletRow = typeof wallets.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
