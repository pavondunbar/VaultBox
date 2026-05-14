# VenCura — Custodial Wallet Platform

> **SANDBOX / EDUCATIONAL USE ONLY — NOT FOR PRODUCTION**
> This codebase is a reference implementation designed for learning, prototyping, and architectural exploration. It is **not audited, not legally reviewed, and must not be used to custody real funds, manage real private keys, or process real financial transactions.** See the [Production Warning](#production-warning) section for full details.

Full-stack custodial wallet platform for **Ethereum Sepolia**, **Solana Devnet**, and **Bitcoin Testnet**. Users register, create multi-chain wallets, fetch balances (native + ERC-20 / SPL tokens), sign messages, send on-chain transactions, speed up pending Ethereum transactions via Replace-By-Fee (RBF), transfer funds between their own wallets, view on-chain transaction history (inbound + outbound) with real-time status tracking, and share wallets with other users via role-based access control — all through a web UI and REST API backed by AES-256-GCM encrypted key storage, JWT session management, TOTP-based two-factor authentication, and email verification.

---

## Table of Contents

- [Overview](#overview)
- [What is Custodial Wallet Infrastructure?](#what-is-custodial-wallet-infrastructure)
- [Architecture](#architecture)
- [Core Modules](#core-modules)
- [Key Features & Design Patterns](#key-features--design-patterns)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [User Flow](#user-flow)
- [Running in a Sandbox Environment](#running-in-a-sandbox-environment)
- [Makefile Commands](#makefile-commands)
- [Testing](#testing)
- [Monitoring Setup](#monitoring-setup)
- [Project Structure](#project-structure)
- [Production Warning](#production-warning)
- [License](#license)

---

## Overview

| Component | Detail |
|-----------|--------|
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Chains | Ethereum Sepolia (Viem) + Solana Devnet (@solana/web3.js) + Bitcoin Testnet (bitcoinjs-lib) |
| Encryption | AES-256-GCM for private keys at rest |
| Sessions | JWT in httpOnly cookies (jose) |
| Authentication | Email/password + TOTP 2FA (otpauth) + email verification (nodemailer) |
| Security | Rate limiting, CSP headers, HSTS, bcryptjs password hashing |
| Ledger | Double-entry accounting (debits = credits) with advisory locking |
| Tests | Vitest (21 test files — unit + integration, no DB or RPC required) |
| Package Manager | pnpm |

VenCura implements the core backend logic of a **custodial cryptocurrency wallet platform** — the kind of infrastructure that underpins institutional digital asset custody services, fintech wallet products, and crypto-native banking platforms.

The system handles the full wallet lifecycle: account registration with email verification, multi-chain wallet creation (Ethereum, Solana, and Bitcoin), private key generation and encrypted storage, balance queries across native and token assets, message signing, on-chain transaction submission, Replace-By-Fee (RBF) for speeding up pending Ethereum transactions, internal transfers between a user's own wallets, on-chain transaction history synced from block explorers (Etherscan for Ethereum, Solana RPC for Solana, Blockstream API for Bitcoin), transaction status tracking with reconciliation, and role-based wallet sharing with other registered users.

Every private key is encrypted with **AES-256-GCM** using a dedicated 256-bit master key before being stored in PostgreSQL. Sessions are managed via **JWT tokens** in `httpOnly` cookies to prevent XSS-based token theft. Optional **TOTP two-factor authentication** adds a second layer of identity verification. Rate limiting protects sensitive endpoints (login, 2FA, email verification) from brute-force attacks. All transactions are recorded using **double-entry accounting** in an append-only ledger where debits and credits always offset to zero.

---

## What is Custodial Wallet Infrastructure?

In cryptocurrency, a **custodial wallet** is one where the service provider holds the private keys on behalf of the user. The user authenticates through traditional credentials (email/password, 2FA) and the platform signs transactions server-side.

This is the model used by:

- **Exchanges** like Coinbase, Kraken, and Binance — users deposit crypto into platform-managed addresses
- **Institutional custodians** like BitGo, Fireblocks, and Anchorage — banks and funds delegate key management to specialized providers
- **Fintech wallets** like Cash App and PayPal — retail users buy/sell/send crypto without managing keys
- **Neo-banks** building crypto-native banking products — onboarding users who don't want to manage seed phrases

The core challenge is securing private keys at rest while making them available for signing operations. Production custodians use HSMs (hardware security modules), MPC (multi-party computation), and key ceremony protocols. This sandbox demonstrates the application-layer architecture — encrypted key storage, session management, multi-chain abstraction, and transaction recording — without the hardware-grade controls required for real funds.

---

## Architecture

```
                        Internet
                           │
                ┌──────────┴──────────┐
                │   Next.js Server    │  :3000
                │  (App Router + API) │
                └──────┬─────┬────────┘
                       │     │
          ┌────────────┘     └────────────┐
          ▼                               ▼
  ┌───────────────┐               ┌───────────────┐
  │   React UI    │               │  API Routes   │
  │  (Dashboard,  │               │ /api/auth/*   │
  │   Wallets)    │               │ /api/wallets/*│
  └───────────────┘               └───────┬───────┘
                                          │
                           ┌──────────────┼──────────────┐
                           ▼              ▼              ▼
                    ┌────────────┐ ┌────────────┐ ┌────────────┐
                    │    Auth    │ │   Crypto   │ │   Chain    │
                    │  Module   │ │   Vault    │ │  Adapters  │
                    │           │ │            │ │            │
                    │ JWT/TOTP  │ │ AES-256-GCM│ │ Viem (ETH) │
                    │ bcryptjs  │ │ encrypt/   │ │ web3.js    │
                    │ Sessions  │ │ decrypt    │ │ (SOL)      │
                    └─────┬─────┘ └─────┬──────┘ │ bitcoinjs  │
                          │             │        │ (BTC)      │
                          ▼             ▼        └─────┬──────┘
                    ┌──────────────────────────────────────┐
                    │          PostgreSQL (Drizzle ORM)     │
                    │                                      │
                    │  users ─── wallets ─── transactions   │
                    │  (credentials,   (encrypted keys,    │
                    │   2FA, email)     addresses, chains)  │
                    └──────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │   Ethereum   │  │    Solana    │  │   Bitcoin    │
            │   Sepolia    │  │    Devnet    │  │   Testnet    │
            │  (Testnet)   │  │  (Testnet)   │  │  (Testnet)   │
            └──────────────┘  └──────────────┘  └──────────────┘
```

**Request Flow:**
1. User authenticates via email/password → JWT issued in httpOnly cookie
2. Authenticated requests hit API routes → middleware validates JWT + applies rate limiting
3. Wallet operations decrypt the private key from the vault, execute chain operations, re-encrypt at rest
4. Transaction history is auto-synced from chain explorers (Etherscan / Solana RPC) and stored in the `transactions` table
5. Wallet owners can share wallets with other users — shared access is checked via the `wallet_shares` table with role-based permissions

---

## Core Modules

### Authentication (`src/lib/auth/`)
Handles user registration, login, session management, email verification, and TOTP two-factor authentication. Passwords are hashed with bcryptjs (14 rounds). Sessions are stateless JWT tokens issued via jose and stored in httpOnly cookies. TOTP secrets are generated with otpauth and verified on login when 2FA is enabled.

### Crypto Vault (`src/lib/crypto/vault.ts`)
Encrypts and decrypts private keys using AES-256-GCM with a 256-bit master key (`ENCRYPTION_KEY`). Each encryption produces a unique 12-byte IV and 16-byte authentication tag. The ciphertext, IV, and tag are stored as a single base64-encoded blob in the database.

### Key Rotation (`src/lib/crypto/key-rotation.ts`)
Supports rotating the master encryption key without downtime. The `rotateEncryptionKey(oldKey, newKey)` function decrypts all wallet private keys with the old master key and re-encrypts them with the new key in configurable batches (default 50). Each batch is wrapped in a database transaction — if any wallet in a batch fails, the entire batch rolls back atomically, ensuring no wallet is left in a mixed-key state after a crash. The `generateEncryptionKey()` helper produces a new 256-bit key. An admin API endpoint (`POST /api/admin/rotate-key`) validates the old key matches the current `ENCRYPTION_KEY` before executing the rotation. Failed batches are tracked and reported without aborting the entire operation.

### MPC Threshold Signing (`src/lib/crypto/mpc.ts`)
Implements Shamir's Secret Sharing over GF(256) for multi-party computation (MPC) key management. Private keys can be split into `n` shares with a configurable threshold `k` (default: 2-of-3). Any `k` shares can reconstruct the original key via Lagrange interpolation — no single party holds enough information to sign alone. The `splitPrivateKey()` and `reconstructPrivateKey()` functions handle hex-encoded keys. The MPC signing endpoint (`POST /api/wallets/:id/mpc-sign`) uses **threshold signing via additive share decomposition** — each share is converted to a Lagrange-interpolated scalar component over the secp256k1 field, partial ECDSA s-values are computed independently and summed, and the full private key is never reconstructed in memory. In production, each share would reside on a separate server or with a separate custodian.

### Chain Adapters (`src/lib/chains/`)
Abstraction layer for multi-chain operations. The Ethereum adapter uses Viem to interact with Sepolia — wallet creation, balance queries (native ETH + ERC-20), message signing, and transaction submission. The Solana adapter uses @solana/web3.js and @solana/spl-token for Devnet — wallet creation, SOL + SPL token balances, signing, and transfers. The Bitcoin adapter uses bitcoinjs-lib with ecpair and tiny-secp256k1 for Testnet — SegWit (P2WPKH/bech32) wallet creation, UTXO-based balance queries, ECDSA message signing, dynamic fee estimation from the Blockstream mempool API, largest-first UTXO selection with exact-match optimization and dust absorption, and PSBT-based transaction construction and broadcasting via Blockstream Esplora API.

### Transaction History Sync (`src/lib/transactions/sync.ts`)
Automatically syncs on-chain transaction history when a wallet's history is viewed and the cached data is stale (older than 2 minutes). Ethereum history is fetched from the Etherscan Sepolia API (native ETH + ERC-20 token transfers). Solana history is fetched directly from the RPC node (SOL system transfers + SPL token transfers). Bitcoin history is fetched from the Blockstream Esplora API (native BTC transfers). Transactions are deduplicated by `(txHash, walletId, direction)` and stored in the database for fast retrieval. Both inbound and outbound transactions are tracked.

### Double-Entry Ledger (`src/lib/transactions/ledger.ts`)
All transactions are recorded using double-entry accounting principles. Every transfer creates a balanced pair of entries: a **debit** (reduction) on the source wallet and a **credit** (addition) on the destination wallet. For external sends (to addresses outside the platform), only a debit is recorded. The `ledger_entries` table is append-only — entries are never modified or deleted. The `verifyLedgerBalance()` function can audit that debits equal credits for any transaction.

### Advisory Locking (`src/lib/db/wallet-lock.ts`)
Wallet operations (`/send` and `/transfer`) use PostgreSQL transaction-scoped advisory locks (`pg_advisory_xact_lock`) to serialize concurrent requests on the same wallet. Before broadcasting a transaction, the handler acquires a lock on the sender's wallet ID, reads the current ledger balance, and rejects the request if funds are insufficient. For transfers between two wallets, locks are acquired in lexicographic order to prevent deadlocks. Locks auto-release on transaction commit or rollback — no manual cleanup or schema migration required.

### Security Layer (`src/lib/security/`)
Rate limiting on sensitive endpoints (login, 2FA verification, email verification) using a Redis-backed sliding-window algorithm. When `REDIS_URL` is configured, rate limits are distributed across all instances via Redis sorted sets. Falls back to in-memory when Redis is unavailable. Request logging captures IP, method, path, duration, and user ID for every API call.

### Hot/Cold Wallet Separation (`src/lib/wallets/hot-cold.ts`)
Classifies wallets as "hot" (online, automated signing) or "cold" (offline, manual approval required). Hot wallets have configurable balance thresholds per chain — when exceeded, the system detects that funds should be swept to cold storage. Threshold comparisons use BigInt-based string arithmetic (no floating-point) to avoid precision loss with financial values. Cold wallets are blocked from automated sends and require the withdrawal approval workflow. Temperature is persisted in the `wallet_temperature` table.

### Withdrawal Approval Workflow (`src/lib/transactions/approval.ts`)
High-value withdrawals require multi-party approval before broadcast. The system checks two conditions: (1) amount exceeds the auto-approve limit for the chain, and (2) velocity — too many withdrawals in the last hour. When either triggers, a pending approval request is created. Approvers vote approve/reject; once quorum is reached, the withdrawal is released. Requests expire after 24 hours. Requesters cannot approve their own withdrawals.

### Real-Time Chain Indexer (`src/lib/indexer/chain-indexer.ts`)
Continuously monitors all three blockchains for inbound transactions to platform wallets. Ethereum: polls new blocks and scans for transfers to known addresses. Solana: polls `getSignaturesForAddress` for each wallet. Bitcoin: polls Blockstream Esplora API. Cursors (last processed block/signature/txid) are persisted in the `indexer_cursors` table. Configurable poll interval via `INDEXER_POLL_MS` (default 15 seconds). Emits events consumed by the monitoring system.

### Monitoring & Alerting (`src/lib/monitoring/`)
Prometheus-compatible metrics via the `prom-client` library exposed at `GET /api/metrics` for scraping by Prometheus/Grafana. Collects default Node.js metrics (GC, event loop, memory) alongside application metrics: HTTP request latency, transaction broadcasts, rate limit hits, indexer performance, wallet operations, and approval queue depth. The alerting module fires severity-based alerts (info/warning/critical) to console and optional webhook (`ALERT_WEBHOOK_URL`) for integration with PagerDuty, Slack, or OpsGenie. Pre-built triggers for large withdrawals, failed transactions, cold wallet access attempts, and indexer lag.

### Middleware (`src/middleware.ts`)
Next.js middleware that validates JWT sessions on protected routes (`/dashboard`, `/wallet`, `/api/*`), redirects unauthenticated users to `/login`, and logs request metadata.

### Environment Validation (`src/lib/env.ts`)
Strict Zod schema that validates all required environment variables at startup. `JWT_SECRET` must be at least 32 characters. `ENCRYPTION_KEY` must be exactly 64 hex characters (256-bit key). Fails fast with actionable error messages if configuration is invalid.

### Replace-By-Fee (`src/lib/transactions/rbf.ts`)
Allows users to speed up stuck Ethereum transactions by resubmitting with the same nonce but higher EIP-1559 gas fees. The `isTxPending()` function checks whether a transaction has been mined. The `replaceTransaction()` function fetches the original transaction, extracts its nonce, and resubmits with higher `maxFeePerGas` and `maxPriorityFeePerGas`. Supports both simple ETH transfers and contract interactions (replays the original calldata). Records replacements in the `rbf_transactions` table for audit trail.

### Transaction Reconciliation (`src/lib/transactions/reconcile.ts`)
Batch-checks all pending transactions against their respective blockchains and updates their status to `confirmed` or `failed`. Ethereum transactions are checked via `getTransactionReceipt` (status 1 = success, status 0 = revert). Solana transactions are checked via `getSignatureStatuses` RPC. Bitcoin transactions are checked via the Blockstream `/tx/{txid}/status` endpoint. Triggered via `POST /api/admin/reconcile`.

### Audit Log (`src/lib/security/audit.ts`)
Persistent, queryable audit trail for security-sensitive operations. Every wallet creation, send, transfer, sign, share, and authentication event is recorded in the `audit_logs` table with user ID, action type, resource, IP address, and optional JSON metadata. The `recordAudit()` helper accepts typed actions and persists to PostgreSQL. Queryable via `make db-audit`.

### Idempotency Keys (`src/lib/security/idempotency.ts`)
Prevents duplicate transaction broadcasts when clients retry failed requests. The `/send` and `/transfer` endpoints accept an `Idempotency-Key` header. If a matching key exists for the user, the cached response is replayed with an `X-Idempotent-Replay: true` header. On success, the response is stored atomically via `INSERT ... ON CONFLICT DO NOTHING` — the unique index on `(key, userId)` guarantees that concurrent requests cannot both claim the same key, eliminating TOCTOU race conditions.

### Circuit Breaker (`src/lib/chains/circuit-breaker.ts`)
Protects the system from cascading failures when chain RPCs are degraded. Tracks failures per endpoint — after 5 consecutive failures, the circuit opens and rejects requests instantly for 30 seconds (avoiding timeout accumulation). After the cooldown, a single test request is allowed through (half-open state). On success, the circuit resets to closed.

### Multi-RPC Failover (`src/lib/chains/rpc-failover.ts`)
Supports multiple RPC endpoints per chain via comma-separated environment variables (e.g., `ETH_RPC_URL=https://primary.io,https://fallback.io`). The `withRpcFailover()` function tries each URL in order, skipping endpoints whose circuit breaker is open. Returns the first successful result. Provides automatic resilience against single-provider outages.

### Health Check (`src/app/api/health/route.ts`)
Structured health endpoint at `GET /api/health` that checks database connectivity with latency measurement. Returns `{ status: "healthy"|"degraded", timestamp, checks: { database: { status, latencyMs } } }`. Returns HTTP 200 when healthy, 503 when degraded. Used by load balancers and monitoring systems.

---

## Key Features & Design Patterns

### AES-256-GCM Encryption at Rest
Private keys are never stored in plaintext. Each key is encrypted with a unique IV (initialization vector) and authenticated with a GCM tag to prevent tampering. The master encryption key is a 256-bit hex string provided via environment variable — it never touches the database.

### Stateless JWT Sessions
Sessions are managed via signed JWT tokens in httpOnly cookies. No session table, no server-side state — the token contains the user ID and expiration. The httpOnly flag prevents JavaScript access, mitigating XSS-based token theft. HTTPS is required in production for cookie security.

### TOTP Two-Factor Authentication
Optional per-user TOTP (Time-based One-Time Password) using the otpauth library. Users scan a QR code with an authenticator app (Google Authenticator, Authy, etc.), verify a code to confirm setup, and then provide a code on every login. The TOTP secret is stored in the database and verified server-side.

### Multi-Chain Abstraction
Chain-specific logic is isolated behind a common interface (`src/lib/chains/types.ts`). Adding a new chain requires implementing the adapter interface — wallet creation, balance query, signing, and transaction submission — without modifying the API routes or middleware.

### Preset Token Registry
The UI provides dropdown selectors for popular tokens on each chain, eliminating the need to manually look up and paste contract addresses. For **Ethereum Sepolia**: USDT, USDC, DAI, WETH, LINK, UNI, AAVE, and WBTC (sourced from Aave V3 Sepolia, Chainlink, and Circle official deployments). For **Solana Devnet**: USDC, USDT, RAY (Raydium), and wSOL. Users can still enter custom token addresses manually. The presets are defined in `src/lib/tokens/erc20-presets.ts` and `src/lib/tokens/spl-presets.ts`.

Users can also **import custom tokens** by pasting any ERC-20 contract address or SPL mint address. The system looks up the token's symbol on-chain (`symbol()` for ERC-20, Metaplex metadata for SPL) and adds it to the dropdown for the current session. Import endpoints: `GET /api/tokens/erc20?address=` and `GET /api/tokens/spl?mint=`.

### On-Chain Transaction History
Transaction history is synced from external sources — Etherscan API for Ethereum Sepolia (native + ERC-20), Solana RPC for Devnet (system + SPL transfers), and Blockstream Esplora API for Bitcoin Testnet (native BTC). The sync is lazy: history is fetched when a user views their transactions and the last sync is older than 2 minutes. Both incoming and outgoing transactions are normalized into a common format and deduplicated on insert. An optional `ETHERSCAN_API_KEY` increases Etherscan rate limits.

### Replace-By-Fee (RBF)
Ethereum transactions that are stuck in the mempool (pending) can be replaced by resubmitting with the same nonce but higher gas fees. The UI shows a "Speed Up" button on pending outgoing Ethereum transactions. The replacement uses EIP-1559 parameters (`maxFeePerGas` and `maxPriorityFeePerGas` in wei). The system validates that the original transaction is still pending before allowing replacement. All replacements are recorded in the `rbf_transactions` table for audit trail.

### Transaction Status Tracking
All outgoing transactions submitted by the platform are recorded with a `status` field: `pending` → `confirmed` or `failed`. Transactions synced from chain explorers default to `confirmed`. The status is displayed in the transaction history UI with color coding. A reconciliation endpoint (`POST /api/admin/reconcile`) batch-checks all pending transactions against their respective blockchains and updates their status.

### Shared Wallets
Wallet owners can share wallets with other registered users by email. Shared access uses a role-based model:
- **Owner** — full control, can share/revoke access
- **Editor** — can sign messages, send transactions, and view balances
- **Viewer** — read-only access to balances and transaction history

The wallet share is recorded in the `wallet_shares` table with a unique constraint on `(walletId, userId)`. Shared wallets appear on the invitee's dashboard alongside their owned wallets. Only wallet owners can manage shares. The invited user must already have a registered account — the system does not send email invitations to unregistered users.

### Rate Limiting
Redis-backed sliding-window rate limiter protects login, 2FA, email verification, wallet sharing, and withdrawal endpoints from brute-force attacks. When `REDIS_URL` is configured, rate limits are distributed across all application instances via Redis sorted sets. Falls back to in-memory when Redis is unavailable. Tracks by IP + endpoint combination.

### Security Headers
Next.js configuration applies strict security headers on every response: Content-Security-Policy, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), HSTS with 2-year max-age, strict Referrer-Policy, and restrictive Permissions-Policy.

### Double-Entry Accounting
All transactions follow double-entry bookkeeping where every debit has a corresponding credit. Internal transfers between wallets create balanced pairs (debit on source, credit on destination). External sends record a debit on the sender's wallet. The ledger is append-only, ensuring a complete audit trail. The `verifyLedgerBalance()` utility confirms that debits equal credits for any transaction hash.

### Concurrency Control via Advisory Locks
The `/send` and `/transfer` endpoints wrap all database operations (balance check, blockchain broadcast, transaction insert, ledger entry) in a single PostgreSQL transaction. Before executing, they acquire a transaction-scoped advisory lock on the sender's wallet ID using `pg_advisory_xact_lock(hashtext(walletId))`. This prevents two concurrent requests from reading the same balance and both passing validation — the second request blocks until the first commits, then sees the updated balance. Transfers lock both the sender and receiver wallets in sorted order to prevent deadlocks. No schema changes are needed — advisory locks are a PostgreSQL built-in.

### Idempotency Keys
The `/send` and `/transfer` endpoints accept an optional `Idempotency-Key` header. When provided, the system checks if a response has already been cached for that key + user combination. If so, the cached response is replayed immediately with an `X-Idempotent-Replay: true` header — no duplicate transaction is broadcast. On success, the response is stored atomically via `INSERT ... ON CONFLICT DO NOTHING` — the unique index on `(key, userId)` guarantees that concurrent requests cannot both claim the same key, eliminating TOCTOU race conditions. This protects against network retries, double-clicks, and client-side retry logic causing duplicate on-chain transactions.

### Circuit Breaker & Multi-RPC Failover
Chain RPC endpoints are protected by a per-URL circuit breaker. After 5 consecutive failures, the circuit opens and rejects requests instantly for 30 seconds — preventing timeout accumulation and cascading failures. `ETH_RPC_URL` and `SOL_RPC_URL` support comma-separated values for multiple endpoints. The `withRpcFailover()` function tries each URL in order, automatically skipping those with open circuits, and returns the first successful result.

### Materialized Wallet Balances
The `wallet_balances` table maintains a pre-computed balance per wallet per token, updated atomically on every ledger write. This provides O(1) balance lookups without aggregating the full ledger — critical at scale when wallets have thousands of ledger entries. The append-only ledger remains the source of truth; the balance table is a read-optimized projection.

### Health Check Endpoint
`GET /api/health` returns structured system status including database connectivity and latency. Returns HTTP 200 with `"healthy"` when all checks pass, or HTTP 503 with `"degraded"` when any check fails. Designed for load balancer health probes and monitoring systems.

### Paginated API Responses
The `GET /api/wallets` and `GET /api/wallets/:id/transactions` endpoints support `?limit=` and `?offset=` query parameters (default 50, max 100). Responses include a `pagination` object with `{ total, limit, offset }` metadata for client-side pagination controls.

---

## Database Schema

### `users`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | User identifier |
| `email` | VARCHAR (unique) | Login email |
| `passwordHash` | VARCHAR | bcryptjs hash (14 rounds) |
| `emailVerified` | BOOLEAN | Email verification status (default: false) |
| `emailVerificationToken` | VARCHAR | Time-expiring verification token |
| `emailVerificationExpiry` | TIMESTAMP | Token expiration |
| `totpSecret` | VARCHAR (nullable) | TOTP secret for 2FA |
| `totpEnabled` | BOOLEAN | Whether 2FA is active (default: false) |
| `createdAt` | TIMESTAMP | Account creation time |

### `wallets`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Wallet identifier |
| `userId` | UUID FK | Owner (cascade delete) |
| `chain` | VARCHAR | `ethereum`, `solana`, or `bitcoin` |
| `address` | VARCHAR | On-chain public address |
| `encryptedPrivateKey` | TEXT | AES-256-GCM encrypted key blob |
| `label` | VARCHAR (nullable) | User-defined wallet name |
| `lastSyncedAt` | TIMESTAMP (nullable) | Last transaction history sync time |
| `createdAt` | TIMESTAMP | Wallet creation time |

### `transactions`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Transaction record identifier |
| `walletId` | UUID FK | Source wallet (cascade delete) |
| `chain` | VARCHAR | `ethereum`, `solana`, or `bitcoin` |
| `txHash` | VARCHAR | On-chain transaction hash |
| `kind` | VARCHAR | `send`, `receive`, or `transfer` |
| `toAddress` | VARCHAR | Destination address |
| `fromAddress` | VARCHAR (nullable) | Source address |
| `direction` | VARCHAR | `incoming` or `outgoing` (default: `outgoing`) |
| `amount` | VARCHAR | Amount as string (precision-safe) |
| `status` | VARCHAR | `pending`, `confirmed`, or `failed` (default: `confirmed`) |
| `tokenSymbol` | VARCHAR (nullable) | Token symbol (ETH, SOL, USDC, etc.) |
| `tokenAddress` | VARCHAR (nullable) | ERC-20 contract address or SPL mint |
| `createdAt` | TIMESTAMP | Record creation time |

Unique index on `(txHash, walletId, direction)` prevents duplicate records when syncing from chain explorers.

### `wallet_shares`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Share record identifier |
| `walletId` | UUID FK | Shared wallet (cascade delete) |
| `userId` | UUID FK | Invitee user (cascade delete) |
| `role` | VARCHAR | `viewer` or `editor` |
| `createdAt` | TIMESTAMP | Share creation time |

Unique index on `(walletId, userId)` — a wallet can only be shared once with each user.

### `ledger_entries`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Entry identifier |
| `txHash` | VARCHAR | On-chain transaction hash |
| `walletId` | UUID FK | Wallet affected (cascade delete) |
| `chain` | VARCHAR | `ethereum`, `solana`, or `bitcoin` |
| `entryType` | VARCHAR | `debit` or `credit` |
| `amount` | VARCHAR | Amount as string (precision-safe) |
| `tokenSymbol` | VARCHAR (nullable) | Token symbol (ETH, SOL, USDC, etc.) |
| `tokenAddress` | VARCHAR (nullable) | ERC-20 contract address or SPL mint |
| `createdAt` | TIMESTAMP | Entry creation time |

Unique index on `(txHash, walletId, entryType)` prevents duplicate entries. The ledger is append-only — entries are never modified or deleted.

### `rbf_transactions`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | RBF record identifier |
| `walletId` | UUID FK | Wallet that initiated the replacement (cascade delete) |
| `originalTxHash` | VARCHAR | Hash of the original pending transaction |
| `replacementTxHash` | VARCHAR | Hash of the replacement transaction |
| `nonce` | VARCHAR | Shared nonce between original and replacement |
| `originalGasPrice` | VARCHAR | Original transaction's gas price (wei) |
| `newGasPrice` | VARCHAR | Replacement transaction's gas price (wei) |
| `toAddress` | VARCHAR | Destination address |
| `amount` | VARCHAR | Transaction value (wei) |
| `tokenAddress` | VARCHAR (nullable) | ERC-20 contract address if token transfer |
| `status` | VARCHAR | `pending`, `confirmed`, or `failed` (default: `pending`) |
| `createdAt` | TIMESTAMP | Record creation time |

### `audit_logs`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Log entry identifier |
| `userId` | UUID (nullable) | User who performed the action |
| `action` | VARCHAR | Action type (e.g., `wallet.create`, `wallet.send`, `auth.login`) |
| `resource` | VARCHAR | Resource type (e.g., `wallet`, `auth`) |
| `resourceId` | VARCHAR (nullable) | Specific resource identifier |
| `ip` | VARCHAR (nullable) | Client IP address |
| `metadata` | TEXT (nullable) | JSON string with additional context |
| `createdAt` | TIMESTAMP | Event time |

### `idempotency_keys`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Record identifier |
| `key` | VARCHAR | Client-provided idempotency key |
| `userId` | UUID | User who made the request |
| `response` | TEXT | Cached JSON response body |
| `statusCode` | VARCHAR | HTTP status code of cached response |
| `createdAt` | TIMESTAMP | Cache time |

Unique index on `(key, userId)` — each key is scoped to a single user.

### `wallet_balances`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Record identifier |
| `walletId` | UUID FK | Wallet (cascade delete) |
| `chain` | VARCHAR | `ethereum`, `solana`, or `bitcoin` |
| `tokenSymbol` | VARCHAR (nullable) | Token symbol |
| `tokenAddress` | VARCHAR (nullable) | Token contract address |
| `balance` | VARCHAR | Current balance as string (default: `"0"`) |
| `updatedAt` | TIMESTAMP | Last update time |

Unique index on `(walletId, tokenAddress)` — one balance row per wallet per token.

### `wallet_temperature`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Record identifier |
| `walletId` | UUID FK | Wallet (cascade delete, unique) |
| `temperature` | VARCHAR | `hot` or `cold` (default: `hot`) |
| `updatedAt` | TIMESTAMP | Last classification change |

### `withdrawal_approvals`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Approval request identifier |
| `walletId` | UUID FK | Source wallet (cascade delete) |
| `requesterId` | UUID FK | User who initiated the withdrawal |
| `chain` | VARCHAR | `ethereum`, `solana`, or `bitcoin` |
| `toAddress` | VARCHAR | Destination address |
| `amount` | VARCHAR | Withdrawal amount |
| `tokenAddress` | VARCHAR (nullable) | Token contract/mint address |
| `status` | VARCHAR | `pending`, `approved`, `rejected`, or `expired` |
| `requiredApprovals` | INTEGER | Number of approvals needed (default: 2) |
| `currentApprovals` | INTEGER | Current approval count |
| `expiresAt` | TIMESTAMP | Request expiration time (24h) |
| `createdAt` | TIMESTAMP | Request creation time |

### `withdrawal_votes`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Vote identifier |
| `approvalId` | UUID FK | Approval request (cascade delete) |
| `voterId` | UUID FK | User who voted |
| `vote` | VARCHAR | `approve` or `reject` |
| `createdAt` | TIMESTAMP | Vote time |

Unique index on `(approvalId, voterId)` — one vote per user per request.

### `indexer_cursors`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Record identifier |
| `chain` | VARCHAR (unique) | Chain identifier (e.g., `ethereum`, `solana:address`) |
| `cursor` | VARCHAR | Last processed block number, signature, or txid |
| `updatedAt` | TIMESTAMP | Last update time |

---

## API Reference

All wallet endpoints require an authenticated session (httpOnly JWT cookie from login or register).

### Authentication

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | `{ email, password }` | Create account |
| `POST` | `/api/auth/login` | `{ email, password, totpCode? }` | Authenticate + set cookie |
| `POST` | `/api/auth/logout` | — | Clear session cookie |
| `GET` | `/api/auth/me` | — | Current user info |
| `POST` | `/api/auth/verify-email` | `{ token }` | Verify email address |
| `POST` | `/api/auth/resend-verification` | `{ email }` | Resend verification email |

### Two-Factor Authentication

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/2fa/setup` | — | Generate TOTP secret + QR code |
| `POST` | `/api/auth/2fa/verify` | `{ code }` | Verify TOTP code during setup |
| `POST` | `/api/auth/2fa/enable` | `{ code }` | Enable 2FA on account |
| `POST` | `/api/auth/2fa/disable` | `{ code }` | Disable 2FA |

### Wallets

| Method | Path | Body / Query | Description |
|--------|------|--------------|-------------|
| `GET` | `/api/wallets` | `?limit=&offset=` | List all user wallets (paginated, default 50, max 100) |
| `POST` | `/api/wallets` | `{ chain, label? }` | Create wallet (`ethereum`, `solana`, or `bitcoin`) |
| `GET` | `/api/wallets/:id/balance` | `?token=` (ERC-20) or `?mint=` (SPL) | Get balance (omit params for native) |
| `POST` | `/api/wallets/:id/sign` | `{ message }` | Sign message → `{ signedMessage }` |
| `POST` | `/api/wallets/:id/send` | `{ to, amount, tokenAddress?, mint? }` | Send on-chain → `{ transactionHash }` |
| `POST` | `/api/wallets/:id/transfer` | `{ toWalletId, amount, tokenAddress?, mint? }` | Transfer between own wallets |
| `GET` | `/api/wallets/:id/transactions` | `?limit=&offset=` | On-chain transaction history (paginated, auto-synced) |
| `POST` | `/api/wallets/:id/mpc-sign` | `{ message, shares: [{index, data}] }` | MPC threshold sign (reconstruct key from shares + sign) |

### Shared Wallets

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/wallets/:id/shares` | — | List users this wallet is shared with (owner only) |
| `POST` | `/api/wallets/:id/shares` | `{ email, role }` | Invite user by email (`viewer` or `editor`) — user must be registered |
| `DELETE` | `/api/wallets/:id/shares/:shareId` | — | Revoke shared access (owner only) |

### Replace-By-Fee (RBF)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/wallets/:id/rbf` | `{ originalTxHash, maxFeePerGas, maxPriorityFeePerGas }` | Replace pending Ethereum tx with higher gas (values in wei) |

### Withdrawal Approvals

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/wallets/:id/approvals` | — | List pending withdrawal approvals for a wallet |
| `POST` | `/api/wallets/:id/approvals` | `{ approvalId, vote }` | Submit approval vote (`approve` or `reject`) |

### Token Import

| Method | Path | Query | Description |
|--------|------|-------|-------------|
| `GET` | `/api/tokens/erc20` | `?address=0x...` | Look up ERC-20 symbol and decimals from contract address (Sepolia) |
| `GET` | `/api/tokens/spl` | `?mint=...` | Look up SPL token symbol and decimals from mint address (Devnet) |

### Admin

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/admin/reconcile` | — | Reconcile all pending transactions (check on-chain status) |
| `POST` | `/api/admin/rotate-key` | `{ oldKey, newKey }` | Rotate master encryption key (re-encrypts all wallet keys) |

### Monitoring

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/metrics` | — | Prometheus-compatible metrics (text exposition format) |

### Health

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | — | System health check (DB connectivity + latency) |

See `examples/api-client-example.ts` for a minimal `fetch`-based API client.

---

## User Flow

### 1. Register & Verify
Create an account at `/register` with email and password. If SMTP is configured, a verification email is sent. Verify at `/verify-email` or skip (verification is optional for sandbox use).

### 2. Enable 2FA (Optional)
Navigate to `/dashboard/security`. Scan the QR code with an authenticator app (Google Authenticator, Authy). Enter the 6-digit code to enable TOTP. All subsequent logins require the code.

### 3. Create Wallets
From the dashboard, create Ethereum (Sepolia) or Solana (Devnet) wallets. Each wallet generates a fresh keypair — the private key is encrypted with AES-256-GCM and stored in PostgreSQL. Multiple wallets per chain are supported.

### 4. Fund via Testnet Faucets
- **ETH Sepolia:** Fund the displayed address from [sepoliafaucet.com](https://sepoliafaucet.com) or a similar faucet
- **SOL Devnet:** `solana airdrop 1 <address> --url devnet`
- **BTC Testnet:** Use [coinfaucet.eu/en/btc-testnet](https://coinfaucet.eu/en/btc-testnet/) or similar faucet

### 5. Transact
- **Balance** — query native (ETH/SOL/BTC) or token balances (ERC-20 contract address or SPL mint)
- **Sign** — sign an arbitrary message with the wallet's private key
- **Send** — submit an on-chain transaction to any address (native or token transfer)
- **Speed Up (RBF)** — replace a pending Ethereum transaction with higher gas fees via the "Speed Up" button
- **Transfer** — move funds between your own wallets (settles on-chain)
- **History** — view on-chain transaction history (both inbound and outbound, auto-synced from Etherscan / Solana RPC / Blockstream)
- **Status** — transactions show real-time status (pending → confirmed or failed)

### 6. Share Wallets
From the wallet detail page, owners can share wallets with other registered users by entering their email address and selecting a role:
- **Editor** — can sign, send, and transfer
- **Viewer** — read-only access to balances and history

The invited user must already have a VenCura account. Shared wallets appear on the invitee's dashboard with a role badge. Owners can revoke access at any time.

---

## Running in a Sandbox Environment

### Prerequisites

- Node.js 22 LTS
- pnpm
- PostgreSQL (local, Docker, or hosted — e.g., Neon, Supabase)
- Ethereum Sepolia RPC endpoint (Infura, Alchemy, or similar)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/pavondunbar/Vencura
cd Vencura

# Install dependencies
make install

# Obtain Encryption Key. Copy and paste it. You will need it for your .env file
openssl rand -hex 32

# Obtain JWT Secret Key. Copy and paste it. You will need it for your .env file
openssl rand -base64 48

# Configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, ETH_RPC_URL, SOL_RPC_URL, BTC_API_URL
# For DATABASE_URL, simply replace 'user' with a username and 'pass' with a password. Leave everything else as is. 

# Create the vencura database
make db-create

# Generate the schemas for the vencura database
make db-generate

# Push the schema to the vencura database
make db-push

# Start the dev server
make dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Random string, **at least 32 characters** |
| `ENCRYPTION_KEY` | Yes | `openssl rand -hex 32` → 64 hex characters (256-bit key) |
| `ETH_RPC_URL` | Yes | Sepolia RPC endpoint (Infura, Alchemy, etc.) — supports comma-separated URLs for failover |
| `SOL_RPC_URL` | No | Defaults to `https://api.devnet.solana.com` — supports comma-separated URLs for failover |
| `BTC_API_URL` | Yes | Blockstream Esplora API URL (default: `https://blockstream.info/testnet/api`) |
| `ETHERSCAN_API_KEY` | No | Etherscan API key for higher rate limits on transaction history sync |
| `APP_URL` | No | Defaults to `http://localhost:3000` |
| `REDIS_URL` | No | Redis connection URL for distributed rate limiting (e.g., `redis://localhost:6379`) |
| `INDEXER_POLL_MS` | No | Chain indexer poll interval in milliseconds (default: 15000) |
| `ALERT_WEBHOOK_URL` | No | Webhook URL for alert delivery (PagerDuty, Slack, OpsGenie) |
| `ETHEREUM_HOT_THRESHOLD` | No | Max ETH balance for hot wallets before sweep (default: 5) |
| `SOLANA_HOT_THRESHOLD` | No | Max SOL balance for hot wallets before sweep (default: 100) |
| `BITCOIN_HOT_THRESHOLD` | No | Max BTC balance for hot wallets before sweep (default: 0.5) |
| `ETHEREUM_AUTO_APPROVE_LIMIT` | No | Max ETH withdrawal without approval (default: 1) |
| `SOLANA_AUTO_APPROVE_LIMIT` | No | Max SOL withdrawal without approval (default: 50) |
| `BITCOIN_AUTO_APPROVE_LIMIT` | No | Max BTC withdrawal without approval (default: 0.1) |
| `SMTP_HOST` | No | SMTP server for email verification |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | Sender email address |

---

## Makefile Commands

### Development

| Command | Description |
|---------|-------------|
| `make install` | Install dependencies via pnpm |
| `make dev` | Start Next.js dev server (port 3000) |
| `make up` | Alias for `make dev` |
| `make down` | Stop backgrounded dev server |
| `make demo` | Start dev server and open browser |
| `make logs` | Background dev server and tail output |
| `make build` | Build for production |
| `make start` | Start production server |
| `make restart` | Restart dev server |

### Quality

| Command | Description |
|---------|-------------|
| `make test` | Run all tests |
| `make test-unit` | Run unit tests (no DB or RPC required) |
| `make test-integration` | Run integration tests only |
| `make lint` | Run ESLint |
| `make typecheck` | Run TypeScript type checker |
| `make integrity` | Run lint + typecheck + tests |

### Database

| Command | Description |
|---------|-------------|
| `make db-create` | Create the PostgreSQL database if it doesn't exist |
| `make db-generate` | Generate Drizzle migration from schema changes |
| `make db-push` | Create the database (if needed) and apply schema |
| `make db-studio` | Open Drizzle Studio (browser-based DB explorer) |
| `make shell-pg` | Open a psql shell using `DATABASE_URL` |

### Database Queries

| Command | Description |
|---------|-------------|
| `make db-users` | List all registered users |
| `make db-wallets` | List all wallets with owner email |
| `make db-transactions` | List recent transactions (limit 20) |
| `make db-shares` | List all shared wallets |
| `make db-ledger` | List recent ledger entries (limit 20) |
| `make db-ledger-balance` | Verify ledger balances (debits should equal credits) |
| `make db-wallet-balances` | Show wallet balances derived from ledger |
| `make db-wallet-balances-fast` | Show wallet balances from materialized table (O(1) lookup) |
| `make db-audit` | List recent audit log entries (limit 20) |

### Utilities

| Command | Description |
|---------|-------------|
| `make health` | Check if the app is responding |
| `make health-api` | Hit `/api/health` for detailed status (DB connectivity, latency) |
| `make clean` | Remove build artifacts (`.next`, `tsconfig.tsbuildinfo`) |
| `make nuke` | Remove all generated files and `node_modules` |
| `make open-docs` | Open README in browser |

### RBF (Replace-By-Fee)

| Command | Description |
|---------|-------------|
| `make rbf-help` | Show RBF usage instructions |
| `make rbf-replace WALLET=<id> TX=<hash> FEE=<wei> TIP=<wei>` | Replace a pending tx with higher gas |
| `make rbf-pending ADDR=<0x...>` | Show recent Ethereum transactions for a wallet |

### Bitcoin (Testnet)

| Command | Description |
|---------|-------------|
| `make btc-help` | Show Bitcoin testnet usage instructions |
| `make btc-balance ADDR=<tb1...>` | Check Bitcoin testnet balance via Blockstream API |

### Monitoring

| Command | Description |
|---------|-------------|
| `make monitoring-up` | Start Prometheus + Grafana stack (Docker) |
| `make monitoring-down` | Stop monitoring stack |
| `make monitoring-logs` | Tail monitoring stack logs |

### Load Testing

| Command | Description |
|---------|-------------|
| `make load-smoke` | Run k6 smoke test (1 VU, sanity check) |
| `make load-test` | Run k6 load test (ramp to 100 VUs) |
| `make load-stress` | Run k6 stress test (ramp to 300 VUs) |

### Key Rotation

| Command | Description |
|---------|-------------|
| `make rotate-key` | Generate a new encryption key and show rotation instructions |

---

## Testing

**Framework:** Vitest 3.1
**Environment:** Node.js (no DOM, no database, no RPC)
**Location:** `tests/` directory

```bash
# Run all tests
make test

# Run with coverage
pnpm exec vitest --coverage
```

### Test Files

| File | What It Tests |
|------|--------------|
| `addresses.test.ts` | Ethereum and Solana address validation |
| `amounts.test.ts` | Amount conversion (native decimals, wei, lamports) |
| `bitcoin.test.ts` | Bitcoin wallet creation, address validation, satoshi formatting, signing |
| `env.test.ts` | Environment variable parsing and validation |
| `ethereum-history.test.ts` | Etherscan transaction history fetching and normalization |
| `jwt.test.ts` | JWT token creation and verification |
| `password.test.ts` | bcryptjs password hashing and comparison |
| `rate-limit.test.ts` | Sliding-window rate limiter logic |
| `rbf.test.ts` | Replace-By-Fee transaction replacement logic |
| `rpc-failover.test.ts` | Circuit breaker states, URL parsing, and multi-RPC failover |
| `solana-history.test.ts` | Solana RPC transaction history parsing and normalization |
| `sync.test.ts` | Stale-sync detection and transaction deduplication logic |
| `integration.test.ts` | API route integration tests (health, pagination, idempotency, audit) |
| `ledger.test.ts` | Double-entry ledger debit/credit pair creation |
| `totp.test.ts` | TOTP secret generation and code verification |
| `vault.test.ts` | AES-256-GCM encrypt/decrypt round-trip |
| `wallet-access.test.ts` | Role-based wallet access control (owner/editor/viewer) |
| `mpc.test.ts` | Shamir's Secret Sharing split/reconstruct (2-of-3, 3-of-5) |

All tests run without external dependencies — no database connection, no chain RPC, no SMTP server. Pure unit tests against isolated modules.

---

## Monitoring Setup

VenCura includes a pre-configured Prometheus + Grafana stack for visualizing application metrics.

### Prerequisites

- Docker and Docker Compose

### Quick Start

```bash
# Start VenCura
make dev

# Start monitoring stack
make monitoring-up
```

- **Grafana:** [http://localhost:3001](http://localhost:3001) — login: `admin` / `admin` (anonymous viewing enabled)
- **Prometheus:** [http://localhost:9090](http://localhost:9090) — raw query interface

A pre-built "VenCura Overview" dashboard is auto-loaded with panels for:

| Panel | Metric |
|-------|--------|
| Request Rate | `rate(vencura_http_requests_total[5m])` |
| Error Rate | `rate(vencura_http_errors_total[5m])` |
| P95 Latency | `histogram_quantile(0.95, rate(vencura_http_request_duration_seconds_bucket[5m]))` |
| Transactions Broadcast | `rate(vencura_tx_broadcast_total[5m])` |
| Rate Limit Hits | `rate(vencura_rate_limit_hits_total[5m])` |
| Active Wallets | `vencura_active_wallets` |
| Pending Approvals | `vencura_approvals_pending` |
| Indexer Health | `rate(vencura_indexer_ticks_total[5m])` vs errors |

The dashboard auto-refreshes every 10 seconds. Prometheus scrapes `GET /api/metrics` every 15 seconds.

### Stop

```bash
make monitoring-down
```

---

## Project Structure

```
VENCURA/
├── src/
│   ├── app/                              # Next.js App Router
│   │   ├── (dashboard)/                  # Authenticated route group
│   │   │   ├── layout.tsx                # Dashboard layout wrapper
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx              # Wallet list
│   │   │   │   └── security/             # 2FA management page
│   │   │   └── wallet/[id]/page.tsx      # Single wallet detail
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── register/route.ts     # Account creation
│   │   │   │   ├── login/route.ts        # Authentication
│   │   │   │   ├── logout/route.ts       # Session clearing
│   │   │   │   ├── me/route.ts           # Current user
│   │   │   │   ├── verify-email/route.ts # Email verification
│   │   │   │   ├── resend-verification/route.ts
│   │   │   │   └── 2fa/                  # TOTP setup/verify/enable/disable
│   │   │   ├── health/route.ts           # System health check
│   │   │   ├── tokens/
│   │   │   │   ├── erc20/route.ts       # ERC-20 symbol lookup by contract address
│   │   │   │   └── spl/route.ts         # SPL token symbol lookup by mint address
│   │   │   └── wallets/
│   │   │       ├── route.ts              # List + create wallets (owned + shared)
│   │   │       └── [id]/
│   │   │           ├── balance/route.ts  # Native + token balances
│   │   │           ├── send/route.ts     # On-chain send
│   │   │           ├── sign/route.ts     # Message signing
│   │   │           ├── transfer/route.ts # Internal transfer
│   │   │           ├── transactions/route.ts  # Transaction history (auto-synced)
│   │   │           ├── rbf/route.ts      # Replace-By-Fee (speed up pending ETH tx)
│   │   │           ├── mpc-sign/route.ts # MPC threshold sign (reconstruct + sign)
│   │   │           └── shares/
│   │   │               ├── route.ts      # List + invite wallet shares
│   │   │               └── [shareId]/route.ts  # Revoke share
│   │   ├── login/page.tsx                # Login page
│   │   ├── register/page.tsx             # Registration page
│   │   ├── verify-email/page.tsx         # Email verification page
│   │   ├── layout.tsx                    # Root layout
│   │   ├── page.tsx                      # Landing page
│   │   └── globals.css                   # Tailwind styles
│   │
│   ├── components/
│   │   ├── CreateWalletForm.tsx           # Wallet creation UI
│   │   ├── WalletDetail.tsx              # Wallet operations UI (role-aware)
│   │   ├── ShareManagement.tsx           # Wallet sharing UI (invite, list, revoke)
│   │   ├── LogoutButton.tsx              # Session logout
│   │   └── ResendVerificationButton.tsx  # Email re-send
│   │
│   ├── lib/
│   │   ├── auth/                         # Authentication modules
│   │   │   ├── jwt.ts                    # JWT creation/verification (jose)
│   │   │   ├── totp.ts                   # TOTP setup/verify (otpauth)
│   │   │   ├── email.ts                  # Email sending (nodemailer)
│   │   │   ├── session.ts                # Session utilities
│   │   │   └── password.ts               # bcryptjs hash/verify
│   │   ├── chains/                       # Chain adapters
│   │   │   ├── ethereum.ts               # Viem (Sepolia)
│   │   │   ├── ethereum-history.ts       # Etherscan transaction history
│   │   │   ├── solana.ts                 # @solana/web3.js (Devnet)
│   │   │   ├── solana-history.ts         # Solana RPC transaction history
│   │   │   ├── bitcoin.ts               # bitcoinjs-lib (Testnet)
│   │   │   ├── bitcoin-history.ts        # Blockstream Esplora transaction history
│   │   │   ├── circuit-breaker.ts        # Per-endpoint circuit breaker
│   │   │   ├── rpc-failover.ts           # Multi-RPC failover with circuit breaker
│   │   │   └── types.ts                  # Chain-agnostic interface + NormalizedTx
│   │   ├── crypto/
│   │   │   ├── vault.ts                  # AES-256-GCM encrypt/decrypt
│   │   │   ├── key-rotation.ts           # Master key rotation (batch re-encryption)
│   │   │   └── mpc.ts                    # Shamir's Secret Sharing (MPC threshold signing)
│   │   ├── db/
│   │   │   ├── index.ts                  # Database connection
│   │   │   ├── schema.ts                # Drizzle ORM schema
│   │   │   ├── types.ts                 # Shared DB context type (db + tx)
│   │   │   └── wallet-lock.ts           # Advisory lock utilities
│   │   ├── security/
│   │   │   ├── logger.ts                 # Request/event logging
│   │   │   ├── rate-limit.ts             # Rate limiting
│   │   │   ├── audit.ts                  # Persistent audit log
│   │   │   └── idempotency.ts            # Idempotency key deduplication
│   │   ├── transactions/
│   │   │   ├── sync.ts                   # Stale-check + sync from chain explorers
│   │   │   ├── ledger.ts                 # Double-entry ledger recording
│   │   │   ├── ledger-balance.ts         # Ledger balance verification
│   │   │   ├── rbf.ts                    # Replace-By-Fee logic (Ethereum)
│   │   │   └── reconcile.ts             # Pending transaction reconciliation
│   │   ├── wallets/
│   │   │   ├── access.ts                 # Role-based authorization (owner/editor/viewer)
│   │   │   ├── hot-cold.ts               # Hot/cold wallet separation & sweep logic
│   │   │   └── key.ts                    # Key management
│   │   ├── indexer/
│   │   │   └── chain-indexer.ts           # Real-time chain indexer (ETH/SOL/BTC)
│   │   ├── monitoring/
│   │   │   ├── metrics.ts                # Prometheus-compatible metrics
│   │   │   └── alerts.ts                 # Severity-based alerting with webhooks
│   │   ├── validation/
│   │   │   └── addresses.ts              # Address validation (ETH + SOL + BTC)
│   │   ├── tokens/
│   │   │   ├── erc20-presets.ts          # Preset ERC-20 tokens (Sepolia)
│   │   │   └── spl-presets.ts            # Preset SPL tokens (Devnet)
│   │   ├── pure/
│   │   │   └── amounts.ts                # Amount conversion utilities
│   │   └── env.ts                        # Environment variable parsing (Zod)
│   │
│   └── middleware.ts                     # Auth + logging middleware
│
├── tests/                                # Vitest unit tests
│   ├── addresses.test.ts
│   ├── amounts.test.ts
│   ├── bitcoin.test.ts
│   ├── env.test.ts
│   ├── ethereum-history.test.ts
│   ├── jwt.test.ts
│   ├── password.test.ts
│   ├── rate-limit.test.ts
│   ├── rbf.test.ts
│   ├── rpc-failover.test.ts
│   ├── solana-history.test.ts
│   ├── sync.test.ts
│   ├── integration.test.ts
│   ├── ledger.test.ts
│   ├── totp.test.ts
│   ├── vault.test.ts
│   ├── wallet-access.test.ts
│   └── mpc.test.ts
│
├── drizzle/                              # Database migrations
│   ├── 0000_tiny_matthew_murdock.sql     # Initial schema
│   ├── 0001_unique_blur.sql              # Constraint updates
│   ├── 0002_quiet_juggernaut.sql         # Wallet sync timestamp
│   ├── 0003_mute_captain_cross.sql       # Wallet shares table
│   ├── 0004_dizzy_wonder_man.sql         # Ledger entries table
│   ├── 0005_living_jack_power.sql        # RBF transactions table
│   ├── 0006_add_transaction_status.sql   # Transaction status column
│   ├── 0007_flashy_speed_demon.sql       # Audit logs + idempotency keys
│   ├── 0008_huge_senator_kelly.sql       # Wallet balances + performance indexes
│   └── meta/                             # Drizzle metadata
│
├── examples/
│   └── api-client-example.ts             # Fetch-based API client reference
│
├── monitoring/                           # Prometheus + Grafana configuration
│   ├── prometheus.yml                    # Prometheus scrape config
│   └── grafana/
│       ├── provisioning/
│       │   ├── datasources/prometheus.yml  # Auto-connect Grafana → Prometheus
│       │   └── dashboards/dashboards.yml   # Dashboard auto-loading config
│       └── dashboards/
│           └── vencura-overview.json     # Pre-built overview dashboard
│
├── load-tests/                           # k6 load testing scripts
│   ├── k6-smoke.js                       # Smoke test (1 VU sanity check)
│   ├── k6-load-test.js                   # Load test (ramp to 100 VUs)
│   ├── k6-stress.js                      # Stress test (ramp to 300 VUs)
│   └── README.md                         # Load testing instructions
│
├── .github/
│   └── workflows/
│       └── ci.yml                        # CI/CD pipeline (lint, typecheck, test, build)
│
├── Makefile                              # Developer commands
├── docker-compose.monitoring.yml         # Prometheus + Grafana Docker stack
├── package.json                          # Dependencies & scripts (pnpm)
├── drizzle.config.ts                     # Drizzle ORM config
├── next.config.ts                        # Security headers + Next.js config
├── tsconfig.json                         # TypeScript (strict mode)
├── vitest.config.ts                      # Vitest configuration
├── tailwind.config.ts                    # Tailwind CSS theme
├── .env.example                          # Environment variable template
└── LICENSE                               # MIT
```

---

## Production Warning

**This project is explicitly NOT suitable for production use.** Custodial wallet infrastructure is among the most security-sensitive systems in financial technology. The following critical components are absent or stubbed:

| Missing Component | Risk if Absent |
|-------------------|----------------|
| HSM-backed key storage (Thales, AWS CloudHSM, YubiHSM) | Software-encrypted keys can be extracted by anyone with DB + `ENCRYPTION_KEY` access |
| ~~MPC threshold signing (Fireblocks, Lit Protocol)~~ | ✅ **Implemented** — Shamir's Secret Sharing (2-of-3) with threshold signing (full key never reconstructed in memory) |
| ~~Key ceremony & rotation procedures~~ | ✅ **Implemented** — Transactional batch key rotation via admin API (crash-safe), key generation helper |
| TLS termination & certificate pinning | Cookie-based sessions require HTTPS — plaintext in development exposes tokens |
| Production authentication (OAuth 2.0 / SSO) | Email/password only — no federated identity, no enterprise SSO |
| ~~Distributed rate limiting (Redis-backed)~~ | ✅ **Implemented** — Redis-backed sliding window rate limiter with in-memory fallback |
| ~~Chain indexer / webhook listener~~ | ✅ **Implemented** — Real-time polling indexer for Ethereum, Solana, and Bitcoin |
| ~~Hot/cold wallet separation~~ | ✅ **Implemented** — Temperature classification, threshold-based sweep detection, cold wallet guards |
| ~~Withdrawal approval workflows~~ | ✅ **Implemented** — Multi-approval quorum, velocity checks, spending limits |
| ~~Monitoring & alerting (Prometheus, Grafana, PagerDuty)~~ | ✅ **Implemented** — Prometheus metrics endpoint, severity-based alerting with webhook delivery |
| Backup & disaster recovery | No automated database backups or tested recovery procedures |
| Security audit & penetration testing | No formal security review has been performed |
| Regulatory compliance (MiCA, state MTL, FinCEN MSB) | No licensing, no SAR filing, no compliance reporting |
| SOC 2 / ISO 27001 controls | No formal security controls framework |
| ~~Solana precision handling~~ | ✅ **Implemented** — Integer lamports (BigInt) end-to-end, no floating-point |
| Bitcoin fee estimation | ✅ **Implemented** — Dynamic fee estimation from Blockstream mempool API with fallback rate |
| UTXO management / coin control | ✅ **Implemented** — Largest-first UTXO selection with exact-match optimization and dust absorption |

> Building a production custodial wallet requires: licensed money transmission or e-money status, HSM or MPC infrastructure with certified key management, hot/cold wallet segregation, multi-signature approval workflows, real-time chain monitoring, regulatory compliance programs, SOC 2 Type II certification, and incident response procedures. **Do not use this code to custody, manage, or transfer real digital assets or funds.**

---

## License

This project is licensed under the MIT License.

---

Built with ❤️ by [Pavon Dunbar](https://github.com/pavondunbar)
