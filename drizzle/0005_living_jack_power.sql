CREATE TABLE "rbf_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"original_tx_hash" text NOT NULL,
	"replacement_tx_hash" text NOT NULL,
	"nonce" text NOT NULL,
	"original_gas_price" text NOT NULL,
	"new_gas_price" text NOT NULL,
	"to_address" text NOT NULL,
	"amount" text NOT NULL,
	"token_address" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rbf_transactions" ADD CONSTRAINT "rbf_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;