# PayGate — Technical Documentation

Complete technical reference for PayGate, a micropayment checkout SDK for APIs built on Circle's Arc nanopayments and the x402 protocol.

---

## Table of Contents

1. [Overview](#overview)
2. [Payment Flow](#payment-flow)
3. [Core Middleware — `withGateway()`](#core-middleware--withgateway)
4. [API Endpoints](#api-endpoints)
5. [Checkout Widget](#checkout-widget)
6. [Dashboard](#dashboard)
7. [AI Payment Agent](#ai-payment-agent)
8. [Database Schema](#database-schema)
9. [Authentication](#authentication)
10. [Security](#security)
11. [Configuration Reference](#configuration-reference)
12. [Arc Testnet Constants](#arc-testnet-constants)
13. [Deployment](#deployment)
14. [Troubleshooting](#troubleshooting)

---

## Overview

PayGate solves a fundamental problem: traditional payment processors charge a minimum of **$0.30 per transaction**, making it impossible to monetize API calls at sub-cent prices. PayGate uses Circle's nanopayment infrastructure to enable gas-free, sub-cent payments settled on Arc — a USDC-native L1 blockchain with sub-second finality.

### How It Works (Summary)

1. Developer wraps any Next.js route handler with `withGateway(handler, price, endpoint)`
2. Unauthenticated requests receive a `402 Payment Required` response with payment requirements
3. Clients sign an EIP-3009 nanopayment authorization (humans via checkout widget, agents via x402 client)
4. Client retries the request with a `payment-signature` header
5. PayGate verifies the payment via Circle's BatchFacilitatorClient and settles it
6. The original route handler executes and returns the response

### Key Design Decisions

- **No smart contracts needed** — PayGate uses Circle Gateway's batching infrastructure. Thousands of nanopayments are batched into a single on-chain transaction.
- **HTTP-native** — The x402 protocol extends HTTP with a `402 Payment Required` status code. Payment requirements and signatures are exchanged via HTTP headers.
- **Agent-first** — AI agents can pay for APIs without a browser, wallet popup, or human intervention.

---

## Payment Flow

### Step-by-Step

```
Step 1: Client Request
───────────────────────
GET /api/premium/weather
(no payment-signature header)

Step 2: 402 Response
───────────────────────
HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: <base64-encoded JSON>

The PAYMENT-REQUIRED header contains:
{
  "x402Version": 2,
  "resource": {
    "url": "/api/premium/weather",
    "description": "Paid resource ($0.002 USDC)",
    "mimeType": "application/json"
  },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:5042002",
    "asset": "0x3600000000000000000000000000000000000000",
    "amount": "2000",           // 2000 atomic units = $0.002 USDC
    "payTo": "<seller_address>",
    "maxTimeoutSeconds": 345600,
    "extra": {
      "name": "GatewayWalletBatched",
      "version": "1",
      "verifyingContract": "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"
    }
  }]
}

Step 3: Client Signs Payment
───────────────────────
The client (human or agent) signs an EIP-3009 TransferWithAuthorization.
The signed payload is base64-encoded.

Step 4: Retry with Payment
───────────────────────
GET /api/premium/weather
payment-signature: <base64-encoded signed payload>

Step 5: Verification & Settlement
───────────────────────
PayGate middleware:
  1. Decodes the payment-signature header
  2. Calls facilitator.verify() to validate the signature
  3. Calls facilitator.settle() to execute the transfer
  4. Records the payment event in Supabase

Step 6: Response
───────────────────────
HTTP/1.1 200 OK
PAYMENT-RESPONSE: <base64-encoded settlement receipt>

{
  "city": "San Francisco",
  "temp": 64,
  "condition": "foggy",
  "humidity": 78,
  "unit": "fahrenheit",
  "timestamp": "2026-07-18T12:00:00.000Z",
  "source": "PayGate Weather API"
}
```

### Price to Atomic Units

USDC has 6 decimal places. The middleware converts dollar amounts:

| Price | Atomic Units |
|-------|-------------|
| $0.000001 | 1 |
| $0.0003 | 300 |
| $0.0005 | 500 |
| $0.001 | 1000 |
| $0.002 | 2000 |
| $0.01 | 10000 |
| $0.03 | 30000 |
| $1.00 | 1000000 |

---

## Core Middleware — `withGateway()`

**File:** `lib/x402.ts`

### Signature

```typescript
function withGateway(
  handler: (req: NextRequest) => Promise<NextResponse>,
  price: string,      // e.g. "$0.001"
  endpoint: string,   // e.g. "/api/premium/weather"
): (req: NextRequest) => Promise<NextResponse>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `handler` | `(req: NextRequest) => Promise<NextResponse>` | The route handler to protect |
| `price` | `string` | Dollar amount (e.g. `"$0.001"`, `"$0.03"`) |
| `endpoint` | `string` | Endpoint identifier for logging |

### Usage

```typescript
import { NextRequest, NextResponse } from "next/server";
import { withGateway } from "@/lib/x402";

const handler = async (req: NextRequest) => {
  return NextResponse.json({ data: "premium content" });
};

export const GET = withGateway(handler, "$0.001", "/api/premium/my-endpoint");
```

### Behavior

1. **No `payment-signature` header** — Returns 402 with `PAYMENT-REQUIRED` header containing payment requirements (scheme, network, asset, amount, payTo, Gateway contract info).

2. **Invalid payment** — Returns 402 with error details from the facilitator.

3. **Valid payment** — Settles via `BatchFacilitatorClient`, logs to Supabase (if configured), calls the original handler, and adds a `PAYMENT-RESPONSE` header to the response.

### Response Headers

| Header | When | Content |
|--------|------|---------|
| `PAYMENT-REQUIRED` | 402 responses | Base64-encoded payment requirements |
| `PAYMENT-RESPONSE` | 200 responses (after payment) | Base64-encoded settlement receipt |
| `Access-Control-*` | All responses | CORS headers for cross-origin access |

### Dependencies

- `@circle-fin/x402-batching` — `BatchFacilitatorClient` for verify/settle
- `@supabase/supabase-js` — Optional event logging

---

## API Endpoints

### Premium Endpoints (Paywalled)

All premium endpoints are wrapped with `withGateway()` and include:
- **Rate limiting**: 60 requests/minute per IP
- **CORS**: Full cross-origin support
- **OPTIONS handler**: Preflight support

#### GET `/api/premium/quote` — $0.001

Returns a random technology quote.

```json
{
  "quote": "The best way to predict the future is to invent it. — Alan Kay",
  "category": "technology",
  "timestamp": "2026-07-18T12:00:00.000Z"
}
```

#### GET `/api/premium/weather` — $0.002

Returns random weather data from 8 cities worldwide.

```json
{
  "city": "San Francisco",
  "temp": 64,
  "condition": "foggy",
  "humidity": 78,
  "unit": "fahrenheit",
  "timestamp": "2026-07-18T12:00:00.000Z",
  "source": "PayGate Weather API"
}
```

#### POST `/api/premium/compute` — $0.0003

Text analysis endpoint. Validates input with Zod.

**Request body:**
```json
{
  "text": "Your text to analyze"
}
```

**Validation rules:**
- `text`: required string, 1–50,000 characters

**Response:**
```json
{
  "summary": "Input contains 4 words across 1 sentence(s).",
  "word_count": 4,
  "sentence_count": 1,
  "char_count": 20,
  "timestamp": "2026-07-18T12:00:00.000Z"
}
```

#### GET `/api/premium/dataset` — $0.01

Returns a sample analytics dataset with 5 metrics.

```json
{
  "dataset": [
    { "id": 1, "metric": "daily_active_users", "value": 14200, "unit": "users" },
    { "id": 2, "metric": "avg_session_duration", "value": 8.4, "unit": "minutes" },
    { "id": 3, "metric": "conversion_rate", "value": 3.2, "unit": "percent" },
    { "id": 4, "metric": "revenue_per_user", "value": 0.47, "unit": "usd" },
    { "id": 5, "metric": "churn_rate", "value": 1.8, "unit": "percent" }
  ],
  "generated_at": "2026-07-18T12:00:00.000Z"
}
```

#### GET `/api/premium/joke` — $0.0005

Returns a random programming/crypto joke.

```json
{
  "setup": "Why do programmers prefer dark mode?",
  "punchline": "Because light attracts bugs.",
  "timestamp": "2026-07-18T12:00:00.000Z",
  "source": "PayGate Joke API"
}
```

#### GET `/api/premium/agent-task` — $0.03

Returns a treasure hunt clue for the agent demo.

```json
{
  "clue": "The treasure is hidden where the sun meets the ocean — latitude 34.0195° N.",
  "step": 1,
  "total_steps": 5,
  "timestamp": "2026-07-18T12:00:00.000Z"
}
```

### Gateway Endpoints (Internal)

#### GET `/api/gateway/balance`

Returns the seller's Gateway and wallet USDC balances. No authentication required (reads from the configured seller wallet). Polled every 10 seconds by the dashboard.

```json
{
  "address": "0x...",
  "gateway": {
    "total": "1.500000",
    "available": "1.200000",
    "withdrawing": "0.300000",
    "withdrawable": "1.200000"
  },
  "wallet": {
    "balance": "0.500000"
  }
}
```

#### POST `/api/gateway/withdraw`

Withdraws USDC from Circle Gateway to the seller's wallet on any supported chain.

**Rate limit:** 5 requests/minute

**Request body (validated with Zod):**
```json
{
  "amount": "1.0",
  "destinationChain": "arcTestnet",
  "destinationAddress": "0x..."  // optional, defaults to seller address
}
```

**Validation rules:**
- `amount`: required, must be a positive number string
- `destinationChain`: must be one of the supported chains (see below)
- `destinationAddress`: optional, must be a valid 0x hex address (40 hex chars)

**Supported chains:**
- `arcTestnet` — Arc Testnet
- `baseSepolia` — Base Sepolia
- `sepolia` — Ethereum Sepolia
- `arbitrumSepolia` — Arbitrum Sepolia
- `optimismSepolia` — Optimism Sepolia
- `avalancheFuji` — Avalanche Fuji
- `polygonAmoy` — Polygon Amoy

**Pre-flight checks:**
1. Verifies seller wallet has native tokens for gas on the source chain
2. Verifies gateway has sufficient available USDC balance
3. For cross-chain: verifies seller wallet has gas on the destination chain

**Response:**
```json
{
  "id": "uuid",
  "txHash": "0x...",
  "amount": "1.000000",
  "sourceChain": "arcTestnet",
  "destinationChain": "baseSepolia",
  "recipient": "0x...",
  "status": "confirmed"
}
```

---

## Checkout Widget

**File:** `components/checkout-widget.tsx`

A React component that guides non-crypto users through the payment flow.

### Props

```typescript
interface CheckoutWidgetProps {
  endpoint: string;                          // API endpoint URL
  method?: string;                           // HTTP method (default: "GET")
  body?: Record<string, unknown>;            // Request body for POST
  onSuccess?: (result: PaymentResult) => void;  // Callback on success
  onClose?: () => void;                      // Close button callback
}
```

### States

1. **Idle (no price)** — Shows "Check Price" button. Calls the endpoint without a payment header to receive the 402 response and extract the price.
2. **Idle (price known)** — Shows the price and a "Pay $X USDC" button.
3. **Loading** — Shows "Processing on Arc Testnet..." spinner.
4. **Success** — Shows payment confirmation with a link to [ArcScan](https://testnet.arcscan.app) explorer.
5. **Error** — Shows error message with retry button.

### Usage

```tsx
<CheckoutWidget
  endpoint="/api/premium/weather"
  onSuccess={(result) => console.log(result)}
/>
```

### Demo Page

The checkout widget demo is available at `/demo` with 4 selectable endpoints.

---

## Dashboard

**Route:** `/dashboard`

### Main Dashboard (`/dashboard`)

The dashboard provides real-time monitoring of all payment activity:

- **Live Activity Feed** — Last 5 payment events with flash animation on new entries
- **Stats Cards** — Total Revenue, Total Payments, Unique Payers, Average Payment
- **Revenue by Endpoint** — Grid showing revenue breakdown per API endpoint
- **Payments Tab** — Full table of all payment events with:
  - Sortable columns (amount, date)
  - Filterable by tx hash, payer, or endpoint
  - Pagination (10, 25, 50, 100 rows per page)
- **Withdrawals Tab** — Same table format for withdrawal records

Data comes from two real-time Supabase hooks:
- `useTransactions()` — Subscribes to `payment_events` table
- `useWithdrawals()` — Subscribes to `withdrawals` table

### Agent Viewer (`/dashboard/agent`)

Simulates an AI agent consuming paywalled endpoints:

- Start/Stop controls
- Live metrics: Total Spent, API Calls, Agent Status
- Activity log showing each request with timestamp, status code, endpoint, amount, and latency
- Cycles through all 6 endpoints with 1.2s intervals

### System Status (`/dashboard/status`)

Health monitoring page:

- **Arc Testnet** — RPC connectivity check
- **Gateway Balance** — Current balance fetch
- **Endpoints** — Checks all 6 premium endpoints return proper 402 responses
- Table showing endpoint, method, price, and status for each

### Gateway Controls (Top Bar)

The dashboard header includes:
- Current gateway balance (auto-refreshes every 10s)
- Withdraw dialog for sending USDC to other chains
- Detailed balance breakdown dialog

---

## AI Payment Agent

**File:** `agent.mts`

A LangChain-based agent that autonomously discovers and pays for paywalled API endpoints.

### How It Works

1. **Wallet Setup** — Generates an ephemeral wallet, funds it from the configured buyer wallet
2. **Gateway Deposit** — Deposits USDC into Circle Gateway for batched payments
3. **Payment Loop** — Cycles through all 6 premium endpoints:
   - Calls endpoint without payment → receives 402
   - Parses payment requirements from `PAYMENT-REQUIRED` header
   - Signs EIP-3009 nanopayment via `@x402/evm`
   - Retries with `payment-signature` header
   - Logs response and latency
4. **Auto-Redeposit** — When gateway balance drops below 0.5 USDC, automatically deposits more
5. **Spending Limit** — Optional `--limit` flag to cap total USDC spent

### Running

```bash
# Default (no limit)
npm run agent

# With 0.5 USDC spending limit
npm run agent -- --limit 0.5
```

### Requirements

- `BUYER_ADDRESS` and `BUYER_PRIVATE_KEY` in `.env.local`
- Buyer wallet funded with testnet USDC from [Circle Faucet](https://faucet.circle.com/)
- The dev server running (`npm run dev`)

---

## Database Schema

**Platform:** Supabase (PostgreSQL)

### `payment_events`

Append-only log of settled x402 payments.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Primary key (auto-generated) |
| `created_at` | `timestamptz` | Event timestamp |
| `endpoint` | `text` | API endpoint path |
| `payer` | `text` | Payer wallet address |
| `amount_usdc` | `text` | Amount paid in USDC |
| `network` | `text` | Network identifier (e.g. `eip155:5042002`) |
| `gateway_tx` | `text` | Gateway transaction hash (nullable) |
| `raw` | `jsonb` | Full payment requirements and settlement result |

### `withdrawals`

Audit trail for Gateway withdrawals.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Primary key (auto-generated) |
| `created_at` | `timestamptz` | Withdrawal timestamp |
| `amount_usdc` | `text` | Amount withdrawn |
| `destination_chain` | `text` | Target chain name |
| `destination_address` | `text` | Recipient address |
| `status` | `text` | `submitted`, `confirmed`, or `failed` |
| `tx_hash` | `text` | On-chain transaction hash (nullable) |

### Row Level Security

Both tables have RLS enabled:
- **SELECT** — Public read access (for dashboard)
- **INSERT/UPDATE** — Service role only (server-side)

### Realtime

Both tables are added to the `supabase_realtime` publication for live subscriptions.

### Migrations

Located in `supabase/migrations/`:
- `20260310000000_create_transactions.sql` — Creates both tables with RLS policies
- `20260310000001_enable_realtime.sql` — Enables realtime for both tables

---

## Authentication

### Login Flow

1. User submits email/password on the landing page
2. Server action `login()` in `app/actions.ts` validates against `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables
3. On success, sets an `httpOnly` session cookie (`session=authenticated`)
4. Redirects to `/dashboard`

### Middleware (Proxy)

**File:** `proxy.ts`

Next.js 16 uses `proxy.ts` (renamed from `middleware.ts`). The proxy:

- Redirects authenticated users from `/` to `/dashboard`
- Redirects unauthenticated users from `/dashboard/*` to `/`
- Matches routes: `/` and `/dashboard/:path*`

### Session Cookie

| Property | Value |
|----------|-------|
| Name | `session` |
| Value | `"authenticated"` |
| httpOnly | `true` |
| secure | `true` in production |
| sameSite | `lax` |
| maxAge | 86400 (1 day) |

---

## Security

### Rate Limiting

**File:** `lib/rate-limit.ts`

In-memory IP-based rate limiter using a `Map<string, { count, resetTime }>`.

| Route Pattern | Limit |
|--------------|-------|
| `/api/premium/*` | 60 requests / minute |
| `/api/gateway/withdraw` | 5 requests / minute |

Returns `429 Too Many Requests` with a `Retry-After` header when exceeded. Expired entries are cleaned up every 60 seconds.

### Input Validation

Zod schemas validate request bodies on POST endpoints:

- **`/api/premium/compute`** — `{ text: string }` (1–50,000 chars)
- **`/api/gateway/withdraw`** — `{ amount: positive number string, destinationChain: supported chain, destinationAddress?: 0x hex address }`

Invalid requests return `400` with field-level error details.

### Security Headers

Configured in `next.config.ts`, applied to all routes:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-DNS-Prefetch-Control` | `on` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

### CORS

Applied to all `withGateway()` responses (both 402 and 200):

| Header | Value |
|--------|-------|
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Methods` | `GET, POST, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, payment-signature` |
| `Access-Control-Expose-Headers` | `PAYMENT-REQUIRED, PAYMENT-RESPONSE` |

All premium route files export an `OPTIONS` handler for preflight requests.

---

## Configuration Reference

### `.env.example`

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Seller wallet (receives payments)
SELLER_ADDRESS=0xYourWalletAddress
SELLER_PRIVATE_KEY=0xYourSellerPrivateKey

# Buyer wallet (for the payment agent)
BUYER_ADDRESS=0xYourBuyerWalletAddress
BUYER_PRIVATE_KEY=0xYourBuyerPrivateKey

# Dashboard login
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme

# LangChain agent (optional — runs in mock mode without it)
OPENAI_API_KEY=your-openai-api-key
```

### Supabase (Optional)

Supabase is optional. Without it:
- Payment events log to console instead of the database
- The dashboard will show no data (but won't crash)
- Withdrawals will still work but won't be tracked

---

## Arc Testnet Constants

| Constant | Value |
|----------|-------|
| Network ID | `eip155:5042002` |
| USDC Contract | `0x3600000000000000000000000000000000000000` |
| Gateway Wallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| RPC URL | `https://rpc.testnet.arc.network` |
| Block Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com/` |

---

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in [Vercel](https://vercel.com)
3. Add all environment variables from `.env.example`
4. Deploy

The `VERCEL_URL` environment variable is automatically set and used for metadata.

### Self-Hosted

```bash
npm run build
npm run start
```

Ensure all environment variables are set. The app listens on port 3000 by default.

### Important Notes

- The rate limiter uses in-memory storage — it resets on server restart and doesn't share state across serverless function instances. For production at scale, replace with Redis or a distributed store.
- Supabase tables must be created before the dashboard will show data. Run `npx supabase db push` or apply migrations manually.
- Both seller and buyer wallets must be funded with testnet USDC before payments or withdrawals will work.

---

## Troubleshooting

### "SELLER_PRIVATE_KEY not configured"

The `SELLER_PRIVATE_KEY` environment variable is missing. Run `npm run generate-wallets` and ensure the key is in `.env.local`.

### "ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required"

Add `ADMIN_EMAIL` and `ADMIN_PASSWORD` to your `.env.local` file.

### 402 responses on all endpoints

This is expected behavior. Premium endpoints return 402 Payment Required when no `payment-signature` header is present. Use the checkout widget at `/demo` or run the agent with `npm run agent`.

### "Seller wallet has no native tokens"

The seller wallet needs USDC on Arc Testnet (USDC is the native gas token on Arc). Fund it at [Circle Faucet](https://faucet.circle.com/).

### Dashboard shows no data

Ensure Supabase is configured and migrations have been run. Without Supabase, payment events are only logged to the console.

### Agent fails to start

1. Ensure `BUYER_ADDRESS` and `BUYER_PRIVATE_KEY` are set
2. Ensure the buyer wallet is funded with testnet USDC
3. Ensure the dev server is running (`npm run dev`)

### Cross-chain withdrawal fails with gas error

For cross-chain withdrawals (e.g., Arc to Base Sepolia), the seller wallet needs native tokens (testnet ETH) on the destination chain to pay for the CCTP mint transaction gas.
