.PHONY: help install dev up down build start restart \
       test test-unit lint typecheck integrity \
       db-push db-generate db-studio shell-pg \
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

db-generate: ## Generate Drizzle migration from schema changes
	pnpm db:generate

db-push: ## Apply database migrations
	pnpm db:push

db-studio: ## Open Drizzle Studio (browser-based DB explorer)
	pnpm db:studio

shell-pg: ## Open a psql shell using DATABASE_URL
	@. ./.env 2>/dev/null; psql "$$DATABASE_URL"

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
