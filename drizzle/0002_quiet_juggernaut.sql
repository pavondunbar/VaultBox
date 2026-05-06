ALTER TABLE "wallets" ADD COLUMN "last_synced_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "tx_wallet_direction_idx" ON "transactions" USING btree ("tx_hash","wallet_id","direction");