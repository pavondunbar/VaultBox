# VenCura

Custodial wallet API and UI for **Ethereum Sepolia** and **Solana Devnet**: create wallets, fetch balances (native + tokens), sign messages, send transfers, and move funds between a user’s own wallets.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript  
- **PostgreSQL** + **Drizzle ORM** for users, wallets (encrypted keys), and outbound transaction history  
- **Viem** (Ethereum) and **@solana/web3.js** + **@solana/spl-token** (Solana)  
- **AES-256-GCM** at-rest encryption for private keys (`ENCRYPTION_KEY`)  
- **JWT** session cookie (`httpOnly`) via **jose**  
- **Vitest** unit tests (no DB or RPC required)

## Local setup

From the project root:

### 1. Environment

Copy `.env.example` to `.env` and set:

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | PostgreSQL URL (e.g. Neon, local Postgres) |
| `JWT_SECRET` | Random string, **≥ 32 characters** |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` → 64 hex chars |
| `ETH_RPC_URL` | Sepolia RPC (Infura, Alchemy, etc.) |
| `SOL_RPC_URL` | Default `https://api.devnet.solana.com` is fine |

### 2. Database

```bash
pnpm db:generate
pnpm db:push
```

### 3. Dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Tests

```bash
pnpm test
```

All unit tests run without a database or chain RPC.

## User flow

1. **Register** at `/register` (or sign in at `/login`).  
2. **Dashboard** — create an Ethereum or Solana wallet (multiple wallets per user).  
3. Open a **wallet** — balance (native or token via optional ERC-20 / SPL mint), sign message, send on-chain, transfer to another of your wallets, view history.

### Testnets & faucets

- **ETH Sepolia:** fund the shown address from [sepoliafaucet.com](https://sepoliafaucet.com) (or similar).  
- **SOL Devnet:** `solana airdrop 1 <address> --url devnet`

## API overview

All wallet routes require an authenticated session (cookie from login/register).

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/auth/register` | `{ email, password }` |
| `POST` | `/api/auth/login` | `{ email, password }` |
| `POST` | `/api/auth/logout` | Clear session |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/wallets` | List wallets |
| `POST` | `/api/wallets` | `{ chain: "ethereum" \| "solana", label? }` |
| `GET` | `/api/wallets/:id/balance` | `?token=` (ERC-20) or `?mint=` (SPL); omit for native |
| `POST` | `/api/wallets/:id/sign` | `{ message }` → `{ signedMessage }` |
| `POST` | `/api/wallets/:id/send` | `{ to, amount, tokenAddress?, mint? }` → `{ transactionHash }` |
| `POST` | `/api/wallets/:id/transfer` | `{ toWalletId, amount, tokenAddress?, mint? }` |
| `GET` | `/api/wallets/:id/transactions` | Stored outbound activity |

See `examples/api-client-example.ts` for minimal `fetch` usage.

## Architecture & security notes

- **Custodial model:** private keys exist only server-side, encrypted in Postgres with a dedicated master key. Anyone with `ENCRYPTION_KEY` and DB access can reconstruct keys — protect secrets like production DB credentials.  
- **Sessions:** JWT in an `httpOnly` cookie reduces XSS token theft vs `localStorage`. Use HTTPS in production.  
- **Scope:** No HSM or MPC; suitable for a demo / take-home, not a regulated custodian without further controls (audit, key ceremony, rate limits, monitoring).  
- **Chain ops:** Sends are real on-chain transactions; internal “transfer” still settles on-chain to the destination wallet’s address.

## Weaknesses / follow-ups

- No email verification, 2FA, or invite/sharing flows.  
- Transaction history is **app-recorded** outbound sends only, not a full chain indexer.  
- Solana SOL amounts use floating-point lamport conversion for convenience; high-precision flows should use integer lamports end-to-end.

## License

MIT — see `LICENSE`.
