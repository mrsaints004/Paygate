# PayGate

**The Stripe for micropayments.** One-line SDK for sub-cent API payments. Charge $0.001 per call. Powered by [Arc nanopayments](https://arc.circle.com/) and the [x402 protocol](https://www.x402.org/).

> Built for the [Programmable Money Hackathon](https://www.encode.club/) (Encode x Arc) — Tracks: DeFi + Agentic Economy.

**Live demo:** [paygate-mu.vercel.app](https://paygate-mu.vercel.app)

---

## The Problem

Traditional payment processors charge a minimum of **$0.30 per transaction**. If you want to charge $0.001 per API call, you'd pay 30,100% in fees. Micropayments are mathematically impossible with Stripe.

## The Solution

PayGate uses Circle's nanopayment infrastructure on Arc (a USDC-native L1 with sub-second finality) to enable **gas-free, sub-cent API monetization**. Circle Gateway batches thousands of tiny payments into a single on-chain transaction, eliminating per-transaction overhead.

**Minimum payment:** $0.000001 | **Settlement:** <500ms | **Protocol fee:** 1%

## One-Line Integration

```typescript
import { withGateway } from "@/lib/x402";

const handler = async (req) => {
  return NextResponse.json({ weather: "sunny", temp: 72 });
};

// This endpoint now costs $0.001 per call
export const GET = withGateway(handler, "$0.001", "weather");
```

No smart contracts. No wallet popups for agents. One line of code.

## How It Works

```
Client (Human or AI Agent)
    │
    ├── 1. GET /api/premium/weather ────────────► PayGate Middleware
    │                                                    │
    ◄── 2. 402 Payment Required ◄───────────────────────┘
    │       (PAYMENT-REQUIRED header with price + payment instructions)
    │
    ├── 3. Sign EIP-3009 nanopayment
    │       Human: Checkout widget (server-side signing)
    │       Agent: x402 client (automatic, no browser needed)
    │
    ├── 4. Retry with payment-signature header ──► PayGate Middleware
    │                                                    │
    │                                              5. Verify + Settle
    │                                                 via Circle Gateway
    │                                                    │
    ◄── 6. 200 OK + data + settlement receipt ◄────────┘
```

## Features

- **Sub-cent payments** — Charge as low as $0.000001 per API call
- **AI agent compatible** — Agents discover and pay for APIs via x402 protocol automatically, no browser needed
- **Checkout widget** — React component for human users with server-side EIP-3009 signing (private keys never touch the browser)
- **Real-time dashboard** — Revenue charts, per-endpoint analytics, agent vs human traffic detection, withdrawals
- **Multi-chain withdrawals** — Withdraw USDC to Arc, Base, Ethereum, Arbitrum, Optimism, Avalanche, or Polygon via CCTP
- **Autonomous agent demo** — LangChain agent that discovers, evaluates, and pays for paywalled APIs with budget-aware reasoning
- **Production hardened** — Rate limiting, Zod validation, CORS, security headers, structured logging, error boundaries

## Demo Endpoints

| Endpoint | Method | Price | Returns |
|----------|--------|-------|---------|
| `/api/premium/quote` | GET | $0.001 | Tech quote |
| `/api/premium/weather` | GET | $0.002 | Weather data |
| `/api/premium/compute` | POST | $0.0003 | Text analysis |
| `/api/premium/dataset` | GET | $0.01 | Analytics dataset |
| `/api/premium/joke` | GET | $0.0005 | Programming joke |
| `/api/premium/agent-task` | GET | $0.03 | Treasure hunt clue |

All return `402 Payment Required` without a valid `payment-signature` header.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui, Lucide icons |
| Database | Supabase (PostgreSQL + Realtime) |
| Payments | `@circle-fin/x402-batching`, `@x402/core`, `@x402/evm` |
| Agent | LangChain + viem for wallet operations |
| Chain | Arc Testnet (USDC-native L1, sub-second finality) |
| Validation | Zod |

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### 1. Clone and install

```bash
git clone https://github.com/jamesfemi/paygate.git
cd paygate
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (optional — falls back to in-memory store) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SELLER_ADDRESS` | Seller wallet address (auto-generated) |
| `SELLER_PRIVATE_KEY` | Seller wallet private key (auto-generated) |
| `BUYER_ADDRESS` | Buyer wallet address (auto-generated) |
| `BUYER_PRIVATE_KEY` | Buyer wallet private key (auto-generated) |
| `ADMIN_EMAIL` | Dashboard login email |
| `ADMIN_PASSWORD` | Dashboard login password |
| `OPENAI_API_KEY` | *(Optional)* For LangChain agent deep mode |

### 3. Generate wallets

```bash
npm run generate-wallets
```

Creates seller and buyer wallet keypairs and writes them to `.env.local`.

### 4. Fund the buyer wallet

Go to [Circle Faucet](https://faucet.circle.com/) and request **Arc Testnet** USDC for your `BUYER_ADDRESS`.

### 5. Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run generate-wallets` | Generate seller + buyer wallet keypairs |
| `npm run agent` | Run the AI payment agent |
| `npm run agent -- --limit 0.5` | Run agent with $0.50 USDC spending limit |

## Project Structure

```
paygate/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── dashboard/
│   │   ├── page.tsx                # Revenue dashboard
│   │   ├── agent/page.tsx          # Agent activity viewer
│   │   └── status/page.tsx         # System health & endpoint status
│   ├── demo/page.tsx               # Checkout widget demo
│   └── api/
│       ├── premium/                # Paywalled endpoints (6 endpoints)
│       ├── checkout/sign/route.ts  # Server-side payment signing
│       ├── gateway/                # Balance + withdrawal
│       ├── discover/route.ts       # Agent endpoint discovery
│       └── health/route.ts         # System health check
├── lib/
│   ├── x402.ts                     # Core withGateway() middleware
│   ├── config.ts                   # Network constants (testnet/mainnet)
│   ├── env.ts                      # Zod environment validation
│   ├── errors.ts                   # Typed error classes
│   ├── logger.ts                   # Structured logging
│   ├── rate-limit.ts               # In-memory rate limiter
│   └── payment-store.ts            # In-memory event store (fallback)
├── components/
│   ├── checkout-widget.tsx         # Payment checkout component
│   ├── api-playground.tsx          # Interactive API tester
│   └── ui/                         # shadcn/ui primitives
├── agent.mts                       # Autonomous payment agent
├── generate-wallets.mts            # Wallet generation script
└── supabase/migrations/            # Database schema
```

## AI Agent

The included agent (`agent.mts`) autonomously discovers and pays for paywalled APIs:

```bash
npm run agent -- --limit 0.5
```

The agent:
1. **Discovers** all endpoints via `/api/discover`
2. **Evaluates** each by value-per-dollar score
3. **Purchases** in priority order with budget-aware decisions
4. **Logs** full reasoning traces (REASONING, DECISION, ACTION)

It generates an ephemeral wallet, funds it from the buyer wallet, deposits into Circle Gateway, and cycles through all premium endpoints.

## Security

- Server-side EIP-3009 signing — private keys never reach the browser
- Auth-gated withdrawals — must be logged in as admin
- Rate limiting — 60 req/min on premium endpoints, 5 req/min on withdrawals
- Zod input validation on all POST endpoints
- Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- Fail-fast environment validation on startup
- httpOnly secure cookies in production

## Documentation

See [DOCUMENTATION.md](./DOCUMENTATION.md) for the full technical reference.

## License

Apache-2.0
