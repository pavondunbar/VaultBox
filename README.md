# VenCura — Custodial Wallet Platform

> **SANDBOX / EDUCATIONAL USE ONLY — NOT FOR PRODUCTION**
> This codebase is a reference implementation designed for learning, prototyping, and architectural exploration. It is **not audited, not legally reviewed, and must not be used to custody real funds, manage real private keys, or process real financial transactions.** See the [Production Warning](#production-warning) section for full details.

Full-stack custodial wallet platform for **Ethereum Sepolia** and **Solana Devnet**. Users register, create multi-chain wallets, fetch balances (native + ERC-20 / SPL tokens), sign messages, send on-chain transactions, transfer funds between their own wallets, view on-chain transaction history (inbound + outbound), and share wallets with other users via role-based access control — all through a web UI and REST API backed by AES-256-GCM encrypted key storage, JWT session management, TOTP-based two-factor authentication, and email verification.

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
- [Project Structure](#project-structure)
- [Production Warning](#production-warning)
- [License](#license)

---

## Overview

| Component | Detail |
|-----------|--------|
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Chains | Ethereum Sepolia (Viem) + Solana Devnet (@solana/web3.js) |
| Encryption | AES-256-GCM for private keys at rest |
| Sessions | JWT in httpOnly cookies (jose) |
| Authentication | Email/password + TOTP 2FA (otpauth) + email verification (nodemailer) |
| Security | Rate limiting, CSP headers, HSTS, bcryptjs password hashing |
| Ledger | Double-entry accounting (debits = credits) |
| Tests | Vitest (13 unit test files — no DB or RPC required) |
| Package Manager | pnpm |

VenCura implements the core backend logic of a **custodial cryptocurrency wallet platform** — the kind of infrastructure that underpins institutional digital asset custody services, fintech wallet products, and crypto-native banking platforms.

The system handles the full wallet lifecycle: account registration with email verification, multi-chain wallet creation (Ethereum and Solana), private key generation and encrypted storage, balance queries across native and token assets, message signing, on-chain transaction submission, internal transfers between a user's own wallets, on-chain transaction history synced from block explorers (Etherscan for Ethereum, Solana RPC for Solana), and role-based wallet sharing with other registered users.

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
                    └─────┬─────┘ └─────┬──────┘ └─────┬──────┘
                          │             │              │
                          ▼             ▼              ▼
                    ┌──────────────────────────────────────┐
                    │          PostgreSQL (Drizzle ORM)     │
                    │                                      │
                    │  users ─── wallets ─── transactions   │
                    │  (credentials,   (encrypted keys,    │
                    │   2FA, email)     addresses, chains)  │
                    └──────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                                   ▼
            ┌──────────────┐                   ┌──────────────┐
            │   Ethereum   │                   │    Solana    │
            │   Sepolia    │                   │    Devnet    │
            │  (Testnet)   │                   │  (Testnet)   │
            └──────────────┘                   └──────────────┘
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

### Chain Adapters (`src/lib/chains/`)
Abstraction layer for multi-chain operations. The Ethereum adapter uses Viem to interact with Sepolia — wallet creation, balance queries (native ETH + ERC-20), message signing, and transaction submission. The Solana adapter uses @solana/web3.js and @solana/spl-token for Devnet — wallet creation, SOL + SPL token balances, signing, and transfers.

### Transaction History Sync (`src/lib/transactions/sync.ts`)
Automatically syncs on-chain transaction history when a wallet's history is viewed and the cached data is stale (older than 2 minutes). Ethereum history is fetched from the Etherscan Sepolia API (native ETH + ERC-20 token transfers). Solana history is fetched directly from the RPC node (SOL system transfers + SPL token transfers). Transactions are deduplicated by `(txHash, walletId, direction)` and stored in the database for fast retrieval. Both inbound and outbound transactions are tracked.

### Double-Entry Ledger (`src/lib/transactions/ledger.ts`)
All transactions are recorded using double-entry accounting principles. Every transfer creates a balanced pair of entries: a **debit** (reduction) on the source wallet and a **credit** (addition) on the destination wallet. For external sends (to addresses outside the platform), only a debit is recorded. The `ledger_entries` table is append-only — entries are never modified or deleted. The `verifyLedgerBalance()` function can audit that debits equal credits for any transaction.

### Security Layer (`src/lib/security/`)
Rate limiting on sensitive endpoints (login, 2FA verification, email verification) using an in-memory sliding-window counter. Request logging captures IP, method, path, duration, and user ID for every API call.

### Middleware (`src/middleware.ts`)
Next.js middleware that validates JWT sessions on protected routes (`/dashboard`, `/wallet`, `/api/*`), redirects unauthenticated users to `/login`, and logs request metadata.

### Environment Validation (`src/lib/env.ts`)
Strict Zod schema that validates all required environment variables at startup. `JWT_SECRET` must be at least 32 characters. `ENCRYPTION_KEY` must be exactly 64 hex characters (256-bit key). Fails fast with actionable error messages if configuration is invalid.

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

### On-Chain Transaction History
Transaction history is synced from external sources — Etherscan API for Ethereum Sepolia (native + ERC-20) and Solana RPC for Devnet (system + SPL transfers). The sync is lazy: history is fetched when a user views their transactions and the last sync is older than 2 minutes. Both incoming and outgoing transactions are normalized into a common format and deduplicated on insert. An optional `ETHERSCAN_API_KEY` increases Etherscan rate limits.

### Shared Wallets
Wallet owners can share wallets with other registered users by email. Shared access uses a role-based model:
- **Owner** — full control, can share/revoke access
- **Editor** — can sign messages, send transactions, and view balances
- **Viewer** — read-only access to balances and transaction history

The wallet share is recorded in the `wallet_shares` table with a unique constraint on `(walletId, userId)`. Shared wallets appear on the invitee's dashboard alongside their owned wallets. Only wallet owners can manage shares. The invited user must already have a registered account — the system does not send email invitations to unregistered users.

### Rate Limiting
In-memory sliding-window rate limiter protects login, 2FA, email verification, and wallet sharing endpoints from brute-force attacks. Tracks by IP + endpoint combination. Not distributed — suitable for single-instance deployments.

### Security Headers
Next.js configuration applies strict security headers on every response: Content-Security-Policy, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), HSTS with 2-year max-age, strict Referrer-Policy, and restrictive Permissions-Policy.

### Double-Entry Accounting
All transactions follow double-entry bookkeeping where every debit has a corresponding credit. Internal transfers between wallets create balanced pairs (debit on source, credit on destination). External sends record a debit on the sender's wallet. The ledger is append-only, ensuring a complete audit trail. The `verifyLedgerBalance()` utility confirms that debits equal credits for any transaction hash.

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
| `chain` | VARCHAR | `ethereum` or `solana` |
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
| `chain` | VARCHAR | `ethereum` or `solana` |
| `txHash` | VARCHAR | On-chain transaction hash |
| `kind` | VARCHAR | `send`, `receive`, or `transfer` |
| `toAddress` | VARCHAR | Destination address |
| `fromAddress` | VARCHAR (nullable) | Source address |
| `direction` | VARCHAR | `incoming` or `outgoing` (default: `outgoing`) |
| `amount` | VARCHAR | Amount as string (precision-safe) |
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
| `chain` | VARCHAR | `ethereum` or `solana` |
| `entryType` | VARCHAR | `debit` or `credit` |
| `amount` | VARCHAR | Amount as string (precision-safe) |
| `tokenSymbol` | VARCHAR (nullable) | Token symbol (ETH, SOL, USDC, etc.) |
| `tokenAddress` | VARCHAR (nullable) | ERC-20 contract address or SPL mint |
| `createdAt` | TIMESTAMP | Entry creation time |

Unique index on `(txHash, walletId, entryType)` prevents duplicate entries. The ledger is append-only — entries are never modified or deleted.

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
| `GET` | `/api/wallets` | — | List all user wallets |
| `POST` | `/api/wallets` | `{ chain, label? }` | Create wallet (`ethereum` or `solana`) |
| `GET` | `/api/wallets/:id/balance` | `?token=` (ERC-20) or `?mint=` (SPL) | Get balance (omit params for native) |
| `POST` | `/api/wallets/:id/sign` | `{ message }` | Sign message → `{ signedMessage }` |
| `POST` | `/api/wallets/:id/send` | `{ to, amount, tokenAddress?, mint? }` | Send on-chain → `{ transactionHash }` |
| `POST` | `/api/wallets/:id/transfer` | `{ toWalletId, amount, tokenAddress?, mint? }` | Transfer between own wallets |
| `GET` | `/api/wallets/:id/transactions` | — | On-chain transaction history (inbound + outbound, auto-synced) |

### Shared Wallets

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/wallets/:id/shares` | — | List users this wallet is shared with (owner only) |
| `POST` | `/api/wallets/:id/shares` | `{ email, role }` | Invite user by email (`viewer` or `editor`) — user must be registered |
| `DELETE` | `/api/wallets/:id/shares/:shareId` | — | Revoke shared access (owner only) |

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

### 5. Transact
- **Balance** — query native (ETH/SOL) or token balances (ERC-20 contract address or SPL mint)
- **Sign** — sign an arbitrary message with the wallet's private key
- **Send** — submit an on-chain transaction to any address (native or token transfer)
- **Transfer** — move funds between your own wallets (settles on-chain)
- **History** — view on-chain transaction history (both inbound and outbound, auto-synced from Etherscan / Solana RPC)

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

# Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, ETH_RPC_URL

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
| `ETH_RPC_URL` | Yes | Sepolia RPC endpoint (Infura, Alchemy, etc.) |
| `SOL_RPC_URL` | No | Defaults to `https://api.devnet.solana.com` |
| `ETHERSCAN_API_KEY` | No | Etherscan API key for higher rate limits on transaction history sync |
| `APP_URL` | No | Defaults to `http://localhost:3000` |
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

### Utilities

| Command | Description |
|---------|-------------|
| `make health` | Check if the app is responding |
| `make clean` | Remove build artifacts (`.next`, `tsconfig.tsbuildinfo`) |
| `make nuke` | Remove all generated files and `node_modules` |
| `make open-docs` | Open README in browser |

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
| `env.test.ts` | Environment variable parsing and validation |
| `ethereum-history.test.ts` | Etherscan transaction history fetching and normalization |
| `jwt.test.ts` | JWT token creation and verification |
| `password.test.ts` | bcryptjs password hashing and comparison |
| `rate-limit.test.ts` | Sliding-window rate limiter logic |
| `solana-history.test.ts` | Solana RPC transaction history parsing and normalization |
| `sync.test.ts` | Stale-sync detection and transaction deduplication logic |
| `ledger.test.ts` | Double-entry ledger debit/credit pair creation |
| `totp.test.ts` | TOTP secret generation and code verification |
| `vault.test.ts` | AES-256-GCM encrypt/decrypt round-trip |
| `wallet-access.test.ts` | Role-based wallet access control (owner/editor/viewer) |

All tests run without external dependencies — no database connection, no chain RPC, no SMTP server. Pure unit tests against isolated modules.

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
│   │   │   └── wallets/
│   │   │       ├── route.ts              # List + create wallets (owned + shared)
│   │   │       └── [id]/
│   │   │           ├── balance/route.ts  # Native + token balances
│   │   │           ├── send/route.ts     # On-chain send
│   │   │           ├── sign/route.ts     # Message signing
│   │   │           ├── transfer/route.ts # Internal transfer
│   │   │           ├── transactions/route.ts  # Transaction history (auto-synced)
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
│   │   │   └── types.ts                  # Chain-agnostic interface + NormalizedTx
│   │   ├── crypto/
│   │   │   └── vault.ts                  # AES-256-GCM encrypt/decrypt
│   │   ├── db/
│   │   │   ├── index.ts                  # Database connection
│   │   │   └── schema.ts                # Drizzle ORM schema
│   │   ├── security/
│   │   │   ├── logger.ts                 # Request/event logging
│   │   │   └── rate-limit.ts             # Rate limiting
│   │   ├── transactions/
│   │   │   ├── sync.ts                   # Stale-check + sync from chain explorers
│   │   │   ├── ledger.ts                 # Double-entry ledger recording
│   │   │   └── ledger-balance.ts         # Ledger balance verification
│   │   ├── wallets/
│   │   │   ├── access.ts                 # Role-based authorization (owner/editor/viewer)
│   │   │   └── key.ts                    # Key management
│   │   ├── validation/
│   │   │   └── addresses.ts              # Address validation (ETH + SOL)
│   │   ├── pure/
│   │   │   └── amounts.ts                # Amount conversion utilities
│   │   └── env.ts                        # Environment variable parsing (Zod)
│   │
│   └── middleware.ts                     # Auth + logging middleware
│
├── tests/                                # Vitest unit tests
│   ├── addresses.test.ts
│   ├── amounts.test.ts
│   ├── env.test.ts
│   ├── ethereum-history.test.ts
│   ├── jwt.test.ts
│   ├── password.test.ts
│   ├── rate-limit.test.ts
│   ├── solana-history.test.ts
│   ├── sync.test.ts
│   ├── ledger.test.ts
│   ├── totp.test.ts
│   ├── vault.test.ts
│   └── wallet-access.test.ts
│
├── drizzle/                              # Database migrations
│   ├── 0000_tiny_matthew_murdock.sql     # Initial schema
│   ├── 0001_unique_blur.sql              # Constraint updates
│   ├── 0002_quiet_juggernaut.sql         # Wallet sync timestamp
│   ├── 0003_mute_captain_cross.sql       # Wallet shares table
│   ├── 0004_dizzy_wonder_man.sql         # Ledger entries table
│   └── meta/                             # Drizzle metadata
│
├── examples/
│   └── api-client-example.ts             # Fetch-based API client reference
│
├── Makefile                              # Developer commands
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
| MPC threshold signing (Fireblocks, Lit Protocol) | Single-key signing — no multi-party authorization for high-value transactions |
| Key ceremony & rotation procedures | No formal process for key generation, backup, or rotation |
| TLS termination & certificate pinning | Cookie-based sessions require HTTPS — plaintext in development exposes tokens |
| Production authentication (OAuth 2.0 / SSO) | Email/password only — no federated identity, no enterprise SSO |
| Distributed rate limiting (Redis-backed) | In-memory rate limiter resets on restart and doesn't work across multiple instances |
| Chain indexer / webhook listener | Transaction history is lazily synced from Etherscan/Solana RPC — no real-time webhook or streaming indexer for instant inbound detection |
| Hot/cold wallet separation | All wallets are "hot" — no cold storage segregation for large balances |
| Withdrawal approval workflows | No multi-approval, no spending limits, no velocity checks |
| Monitoring & alerting (Prometheus, Grafana, PagerDuty) | No observability into system health, failed transactions, or anomalous activity |
| Backup & disaster recovery | No automated database backups or tested recovery procedures |
| Security audit & penetration testing | No formal security review has been performed |
| Regulatory compliance (MiCA, state MTL, FinCEN MSB) | No licensing, no SAR filing, no compliance reporting |
| SOC 2 / ISO 27001 controls | No formal security controls framework |
| Solana precision handling | Floating-point lamport conversion — production systems should use integer lamports end-to-end |

> Building a production custodial wallet requires: licensed money transmission or e-money status, HSM or MPC infrastructure with certified key management, hot/cold wallet segregation, multi-signature approval workflows, real-time chain monitoring, regulatory compliance programs, SOC 2 Type II certification, and incident response procedures. **Do not use this code to custody, manage, or transfer real digital assets or funds.**

---

## License

This project is licensed under the MIT License.

---

Built with ❤️ for Fireblocks by [Pavon Dunbar](https://github.com/pavondunbar)
