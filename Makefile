.PHONY: help install dev up down build start restart \
       test test-unit lint typecheck integrity \
       db-create db-push db-generate db-studio shell-pg \
       db-users db-wallets db-transactions db-shares db-ledger db-ledger-balance db-wallet-balances \
       health clean nuke logs demo open-docs

# ──────────────────────────────────────────────
# VenCura — Custodial Wallet Platform
# ──────────────────────────────────────────────

APP_PORT   ?= 3000
APP_URL    ?= http://localhost:$(APP_PORT)
PID_FILE   := .dev.pid

help: ## Show available commands
	@printf '\nUsage: make <target>\n\n'
	@awk 'BEGIN {FS = ":.*##"} \
		/^[a-zA-Z_-]+:.*##/ { \
			printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 \
		}' $(MAKEFILE_LIST)
	@echo ''

# ── Setup ────────────────────────────────────

install: ## Install dependencies via pnpm
	pnpm install --frozen-lockfile

# ── Development ──────────────────────────────

dev: ## Start Next.js dev server (default: port 3000)
	pnpm dev

up: dev ## Alias for dev

down: ## Stop the dev server (if backgrounded via make logs)
	@if [ -f $(PID_FILE) ]; then \
		kill $$(cat $(PID_FILE)) 2>/dev/null || true; \
		rm -f $(PID_FILE); \
		echo "Dev server stopped."; \
	else \
		echo "No PID file found. Kill the process manually or use Ctrl-C."; \
	fi

logs: ## Start dev server in background and tail output
	@pnpm dev > /tmp/vencura-dev.log 2>&1 & echo $$! > $(PID_FILE)
	@echo "Dev server started (PID $$(cat $(PID_FILE))). Tailing logs..."
	@tail -f /tmp/vencura-dev.log

demo: ## Start dev server and open the app in a browser
	@pnpm dev & sleep 3 && open $(APP_URL)

# ── Build & Run ──────────────────────────────

build: ## Build for production
	pnpm build

start: ## Start production server
	pnpm start

restart: down dev ## Restart the dev server

# ── Quality ──────────────────────────────────

test: ## Run all tests
	pnpm test

test-unit: ## Run unit tests (same suite — no DB or RPC needed)
	pnpm test

lint: ## Run ESLint
	pnpm lint

typecheck: ## Run TypeScript type checker
	pnpm exec tsc --noEmit

integrity: lint typecheck test ## Run lint + typecheck + tests

# ── Database ─────────────────────────────────

db-create: ## Create the PostgreSQL database if it doesn't exist
	@. ./.env 2>/dev/null; \
	DB_NAME=$$(echo "$$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p'); \
	if psql "$$DATABASE_URL" -c '' 2>/dev/null; then \
		echo "Database '$$DB_NAME' already exists."; \
	else \
		BASE_URL=$$(echo "$$DATABASE_URL" | sed 's|/[^/]*$$|/postgres|'); \
		echo "Creating database '$$DB_NAME'..."; \
		psql "$$BASE_URL" -c "CREATE DATABASE $$DB_NAME;" && \
		echo "Database '$$DB_NAME' created."; \
	fi

db-generate: ## Generate Drizzle migration from schema changes
	pnpm db:generate

db-push: db-create ## Apply database migrations
	pnpm db:push

db-studio: ## Open Drizzle Studio (browser-based DB explorer)
	pnpm db:studio

shell-pg: ## Open a psql shell using DATABASE_URL
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL"

# ── Database Queries ─────────────────────────

db-users: ## List all registered users
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT id, email, email_verified, totp_enabled, created_at FROM users ORDER BY created_at DESC;"

db-wallets: ## List all wallets with owner email
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT w.id, u.email AS owner, w.chain, w.address, w.label, w.created_at \
		FROM wallets w JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC;"

db-transactions: ## List recent transactions (limit 20)
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT t.id, u.email, t.chain, t.kind, t.direction, t.amount, t.token_symbol, \
		LEFT(t.tx_hash, 16) || '...' AS tx_hash, t.created_at \
		FROM transactions t \
		JOIN wallets w ON t.wallet_id = w.id \
		JOIN users u ON w.user_id = u.id \
		ORDER BY t.created_at DESC LIMIT 20;"

db-shares: ## List all shared wallets
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT ws.id, owner.email AS owner, shared.email AS shared_with, \
		ws.role, w.chain, LEFT(w.address, 12) || '...' AS wallet, ws.created_at \
		FROM wallet_shares ws \
		JOIN wallets w ON ws.wallet_id = w.id \
		JOIN users owner ON w.user_id = owner.id \
		JOIN users shared ON ws.user_id = shared.id \
		ORDER BY ws.created_at DESC;"

db-ledger: ## List recent ledger entries (limit 20)
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT le.id, u.email, le.entry_type, le.amount, le.token_symbol, \
		LEFT(le.tx_hash, 16) || '...' AS tx_hash, le.created_at \
		FROM ledger_entries le \
		JOIN wallets w ON le.wallet_id = w.id \
		JOIN users u ON w.user_id = u.id \
		ORDER BY le.created_at DESC LIMIT 20;"

db-ledger-balance: ## Verify ledger balances (debits should equal credits)
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT tx_hash, \
		SUM(CASE WHEN entry_type = 'debit' THEN amount::numeric ELSE 0 END) AS total_debits, \
		SUM(CASE WHEN entry_type = 'credit' THEN amount::numeric ELSE 0 END) AS total_credits, \
		CASE \
			WHEN SUM(CASE WHEN entry_type = 'debit' THEN amount::numeric ELSE 0 END) = \
			     SUM(CASE WHEN entry_type = 'credit' THEN amount::numeric ELSE 0 END) \
			THEN '✓ balanced' ELSE '✗ UNBALANCED' \
		END AS status \
		FROM ledger_entries GROUP BY tx_hash ORDER BY tx_hash;"

db-wallet-balances: ## Show wallet balances derived from ledger
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT u.email, w.chain, LEFT(w.address, 12) || '...' AS wallet, \
		w.label, \
		COALESCE(SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount::numeric ELSE 0 END), 0) - \
		COALESCE(SUM(CASE WHEN le.entry_type = 'debit' THEN le.amount::numeric ELSE 0 END), 0) AS ledger_balance, \
		le.token_symbol \
		FROM wallets w \
		JOIN users u ON w.user_id = u.id \
		LEFT JOIN ledger_entries le ON w.id = le.wallet_id \
		GROUP BY u.email, w.id, w.chain, w.address, w.label, le.token_symbol \
		HAVING COUNT(le.id) > 0 \
		ORDER BY u.email, w.chain;"

# ── Health ───────────────────────────────────

health: ## Check if the app is responding
	@curl -sf $(APP_URL) > /dev/null \
		&& echo "\033[32mHealthy\033[0m — $(APP_URL) is up" \
		|| echo "\033[31mUnhealthy\033[0m — $(APP_URL) is not responding"

# ── Cleanup ──────────────────────────────────

clean: ## Remove build artifacts
	rm -rf .next tsconfig.tsbuildinfo

nuke: clean ## Remove all generated files and reinstall
	rm -rf node_modules .dev.pid /tmp/vencura-dev.log
	@echo "Nuked. Run 'make install' to restore."

# ── Docs ─────────────────────────────────────

open-docs: ## Open the README in the default browser
	@open README.md 2>/dev/null || xdg-open README.md 2>/dev/null || echo "Open README.md manually."
