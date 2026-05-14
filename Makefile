.PHONY: help install dev up down build start restart \
       test test-unit test-integration lint typecheck integrity \
       db-create db-push db-generate db-studio shell-pg \
       db-users db-wallets db-transactions db-shares db-ledger db-ledger-balance db-wallet-balances db-wallet-balances-fast db-audit \
       db-approvals db-temperature db-indexer-cursors \
       health health-api metrics clean nuke logs demo open-docs \
       rbf-help rbf-replace rbf-pending \
       btc-help btc-balance

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

test-integration: ## Run integration tests only
	pnpm exec vitest run tests/integration.test.ts

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

db-audit: ## List recent audit log entries (limit 20)
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT al.id, u.email, al.action, al.resource, al.resource_id, al.ip, al.created_at \
		FROM audit_logs al \
		LEFT JOIN users u ON al.user_id = u.id \
		ORDER BY al.created_at DESC LIMIT 20;"

db-wallet-balances-fast: ## Show wallet balances from materialized table (O(1) lookup)
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT u.email, wb.chain, LEFT(w.address, 12) || '...' AS wallet, \
		w.label, wb.balance, wb.token_symbol, wb.token_address, wb.updated_at \
		FROM wallet_balances wb \
		JOIN wallets w ON wb.wallet_id = w.id \
		JOIN users u ON w.user_id = u.id \
		ORDER BY u.email, wb.chain;"

db-approvals: ## List pending withdrawal approvals
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT wa.id, u.email AS requester, wa.chain, wa.amount, wa.to_address, \
		wa.status, wa.current_approvals || '/' || wa.required_approvals AS approvals, \
		wa.expires_at, wa.created_at \
		FROM withdrawal_approvals wa \
		JOIN users u ON wa.requester_id = u.id \
		ORDER BY wa.created_at DESC LIMIT 20;"

db-temperature: ## Show wallet temperature classifications
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT u.email, w.chain, LEFT(w.address, 12) || '...' AS wallet, \
		w.label, wt.temperature, wt.updated_at \
		FROM wallet_temperature wt \
		JOIN wallets w ON wt.wallet_id = w.id \
		JOIN users u ON w.user_id = u.id \
		ORDER BY wt.temperature, u.email;"

db-indexer-cursors: ## Show indexer cursor positions
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL" -c \
		"SELECT chain, cursor, updated_at FROM indexer_cursors ORDER BY chain;"

# ── Monitoring ───────────────────────────────

metrics: ## Fetch Prometheus metrics from the running app
	@curl -sf $(APP_URL)/api/metrics || echo "\033[31mFailed\033[0m — is the app running?"

# ── RBF (Replace-By-Fee) ─────────────────────

rbf-help: ## Show RBF usage instructions
	@printf '\n\033[36mRBF (Replace-By-Fee) — Speed up pending Ethereum transactions\033[0m\n\n'
	@echo '  Replaces a stuck (pending) transaction by resubmitting with the SAME nonce'
	@echo '  but HIGHER gas fees. The network drops the old tx and mines the new one.'
	@echo ''
	@echo '  Requirements:'
	@echo '    • The original transaction must still be pending (unconfirmed)'
	@echo '    • New maxFeePerGas must be higher than the original'
	@echo '    • Gas values are in wei (e.g. 30 Gwei = 30000000000)'
	@echo ''
	@echo '  Workflow:'
	@echo '    1. Send a transaction that gets stuck (low gas)'
	@echo '    2. Replace it:  make rbf-replace WALLET=<id> TX=<hash> FEE=<wei> TIP=<wei>'
	@echo '    3. Check status: make rbf-pending ADDR=<0x...>'
	@echo ''
	@echo '  The UI also shows a "Speed Up" button on pending transactions.'
	@echo ''

rbf-replace: ## Replace a pending tx with higher gas. Usage: make rbf-replace WALLET=<id> TX=<hash> FEE=<maxFeeWei> TIP=<priorityFeeWei>
	@if [ -z "$(WALLET)" ] || [ -z "$(TX)" ] || [ -z "$(FEE)" ] || [ -z "$(TIP)" ]; then \
		echo "Usage: make rbf-replace WALLET=<wallet-id> TX=<original-tx-hash> FEE=<maxFeePerGas-wei> TIP=<maxPriorityFeePerGas-wei>"; \
		echo "Example: make rbf-replace WALLET=abc-123 TX=0xdead... FEE=30000000000 TIP=2000000000"; \
		exit 1; \
	fi
	@curl -s -X POST $(APP_URL)/api/wallets/$(WALLET)/rbf \
		-H 'Content-Type: application/json' \
		-b /tmp/vencura-cookie.txt \
		-d '{"originalTxHash":"$(TX)","maxFeePerGas":"$(FEE)","maxPriorityFeePerGas":"$(TIP)"}' | \
		python3 -m json.tool 2>/dev/null || cat

rbf-pending: ## Show recent Ethereum transactions for a wallet. Usage: make rbf-pending ADDR=<0x...>
	@if [ -z "$(ADDR)" ]; then \
		echo "Usage: make rbf-pending ADDR=<0x-address>"; \
		exit 1; \
	fi
	@. ./.env 2>/dev/null; \
	echo "Checking txs for $(ADDR) on Sepolia..."; \
	curl -s "https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=$(ADDR)&startblock=0&endblock=99999999&sort=desc&page=1&offset=5$${ETHERSCAN_API_KEY:+&apikey=$$ETHERSCAN_API_KEY}" | \
		python3 -c "import sys,json;data=json.load(sys.stdin);[print(f\"nonce={t['nonce']} hash={t['hash'][:20]}... gasPrice={int(t['gasPrice'])//10**9}gwei status={'✓' if t['txreceipt_status']=='1' else '⏳' if t['txreceipt_status']=='' else '✗'}\") for t in data.get('result',[])]" 2>/dev/null || echo "Could not fetch transactions."

# ── Bitcoin (Testnet) ─────────────────────────

btc-help: ## Show Bitcoin testnet usage instructions
	@printf '\n\033[36mBitcoin (Testnet) — Native BTC on Bitcoin Testnet\033[0m\n\n'
	@echo '  VenCura creates SegWit (bech32/tb1) wallets on Bitcoin Testnet.'
	@echo ''
	@echo '  Faucets:'
	@echo '    • https://coinfaucet.eu/en/btc-testnet/'
	@echo '    • https://bitcoinfaucet.uo1.net/'
	@echo '    • https://testnet-faucet.com/btc-testnet/'
	@echo ''
	@echo '  Explorer:'
	@echo '    • https://mempool.space/testnet'
	@echo ''
	@echo '  Check balance via CLI:'
	@echo '    make btc-balance ADDR=<tb1...>'
	@echo ''

btc-balance: ## Check Bitcoin testnet balance. Usage: make btc-balance ADDR=<tb1...>
	@if [ -z "$(ADDR)" ]; then \
		echo "Usage: make btc-balance ADDR=<tb1-address>"; \
		exit 1; \
	fi
	@. ./.env 2>/dev/null; \
	API_URL=$${BTC_API_URL:-https://blockstream.info/testnet/api}; \
	echo "Fetching balance for $(ADDR)..."; \
	STATS=$$(curl -sf "$$API_URL/address/$(ADDR)") && \
	FUNDED=$$(echo "$$STATS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['chain_stats']['funded_txo_sum']+d['mempool_stats']['funded_txo_sum'])" 2>/dev/null) && \
	SPENT=$$(echo "$$STATS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['chain_stats']['spent_txo_sum']+d['mempool_stats']['spent_txo_sum'])" 2>/dev/null) && \
	SATS=$$((FUNDED - SPENT)) && \
	printf "Balance: %s satoshis (%.8f BTC)\n" "$$SATS" $$(echo "scale=8; $$SATS / 100000000" | bc) \
	|| echo "Could not fetch balance. Is the address valid?"

# ── Health ───────────────────────────────────

health: ## Check if the app is responding
	@curl -sf $(APP_URL) > /dev/null \
		&& echo "\033[32mHealthy\033[0m — $(APP_URL) is up" \
		|| echo "\033[31mUnhealthy\033[0m — $(APP_URL) is not responding"

health-api: ## Hit /api/health for detailed status (DB connectivity, latency)
	@curl -sf $(APP_URL)/api/health | python3 -m json.tool 2>/dev/null \
		|| echo "\033[31mUnhealthy\033[0m — $(APP_URL)/api/health is not responding"

# ── Cleanup ──────────────────────────────────

clean: ## Remove build artifacts
	rm -rf .next tsconfig.tsbuildinfo

nuke: clean ## Remove all generated files and reinstall
	rm -rf node_modules .dev.pid /tmp/vencura-dev.log
	@echo "Nuked. Run 'make install' to restore."

# ── Docs ─────────────────────────────────────

open-docs: ## Open the README in the default browser
	@open README.md 2>/dev/null || xdg-open README.md 2>/dev/null || echo "Open README.md manually."

# ── Monitoring (Prometheus + Grafana) ────────

monitoring-up: ## Start Prometheus + Grafana stack
	@docker compose -f docker-compose.monitoring.yml up -d
	@echo "Prometheus: http://localhost:9090"
	@echo "Grafana:    http://localhost:3001 (admin/admin)"

monitoring-down: ## Stop monitoring stack
	@docker compose -f docker-compose.monitoring.yml down

monitoring-logs: ## Tail monitoring stack logs
	@docker compose -f docker-compose.monitoring.yml logs -f

# ── Load Testing ─────────────────────────────

load-smoke: ## Run k6 smoke test (1 VU, sanity check)
	@command -v k6 >/dev/null 2>&1 || { echo "Error: k6 is not installed. Install with: brew install k6"; exit 1; }
	@k6 run load-tests/k6-smoke.js

load-test: ## Run k6 load test (ramp to 100 VUs)
	@command -v k6 >/dev/null 2>&1 || { echo "Error: k6 is not installed. Install with: brew install k6"; exit 1; }
	@k6 run load-tests/k6-load-test.js

load-stress: ## Run k6 stress test (ramp to 300 VUs)
	@command -v k6 >/dev/null 2>&1 || { echo "Error: k6 is not installed. Install with: brew install k6"; exit 1; }
	@k6 run load-tests/k6-stress.js

# ── Key Rotation ─────────────────────────────

rotate-key: ## Generate a new encryption key for rotation
	@echo "New key: $$(openssl rand -hex 32)"
	@echo "Use POST /api/admin/rotate-key with { oldKey, newKey } to rotate."
