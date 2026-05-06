CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tx_hash" text NOT NULL,
	"wallet_id" uuid NOT NULL,
	"chain" text NOT NULL,
	"entry_type" text NOT NULL,
	"amount" text NOT NULL,
	"token_symbol" text,
	"token_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_tx_wallet_type_idx" ON "ledger_entries" USING btree ("tx_hash","wallet_id","entry_type");