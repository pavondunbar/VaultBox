CREATE TABLE "wallet_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"chain" text NOT NULL,
	"token_symbol" text,
	"token_address" text,
	"balance" text DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_balances" ADD CONSTRAINT "wallet_balances_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_balances_wallet_token_idx" ON "wallet_balances" USING btree ("wallet_id","token_address");--> statement-breakpoint
CREATE INDEX "ledger_wallet_entry_idx" ON "ledger_entries" USING btree ("wallet_id","entry_type");--> statement-breakpoint
CREATE INDEX "tx_wallet_created_idx" ON "transactions" USING btree ("wallet_id","created_at");