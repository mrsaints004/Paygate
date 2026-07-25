# PayGate

**The Stripe for micropayments.** Drop-in SDK for sub-cent API payments. Charge $0.001 per call. Powered by [Arc nanopayments](https://arc.circle.com/) and the [x402 protocol](https://www.x402.org/).

> Built for the [Programmable Money Hackathon](https://www.encode.club/) (Encode x Arc) — Tracks: DeFi + Agentic Economy.

---

## What is PayGate?

Traditional payment processors charge a minimum of **$0.30 per transaction**, making micropayments mathematically impossible. PayGate uses Circle's nanopayment infrastructure on Arc (a USDC-native L1 with sub-second finality) to enable **gas-free, sub-cent API monetization**.

One line of code. No smart contracts. No wallet popups for agents.

```typescript
import { withGateway } from "@/lib/x402";

const handler = async (req) => {
  return NextResponse.json({ weather: "sunny", temp: 72 });
};

// This endpoint now costs $0.001 per call
export const GET = withGateway(handler, "$0.001", "weather");
```

## Features

- **Sub-cent payments** — Charge as low as $0.000001 per API call
- **AI agent compatible** — Agents pay via x402 protocol automatically, no browser or wallet popup needed
- **Real-time dashboard** — Monitor revenue, per-endpoint analytics, human vs agent traffic, withdraw earnings
- **Checkout widget** — React component for non-crypto users (EIP-3009 signing)
- **Multi-chain withdrawals** — Withdraw USDC to Arc, Base, Ethereum, Arbitrum, Optimism, Avalanche, or Polygon testnets
- **Autonomous agent demo** — LangChain agent that discovers, pays for, and consumes paywalled APIs
- **Production hardened** — Rate limiting, Zod input validation, CORS, security headers, error boundaries

## Architecture

```
Client (Human / AI Agent)
    │
    ├── 1. GET /api/premium/weather ────────────► PayGate Middleware
    │                                                    │
    ◄── 2. 402 Payment Required ◄───────────────────────┘
    │       (PAYMENT-REQUIRED header with price)
    │
    ├── 3. Sign EIP-3009 nanopayment
    │       Human: Checkout widget
    │       Agent: x402 client (auto)
    │
    ├── 4. Retry with payment-signature header ──► PayGate Middleware
    │                                                    │
    │                                              5. Verify + Settle
    │                                                 via Circle Gateway
    │                                                    │
    ◄── 6. 200 OK + response data ◄─────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui, Lucide icons |
| Database | Supabase (PostgreSQL + Realtime) |
| Payments | `@circle-fin/x402-batching`, `@x402/core`, `@x402/evm` |
| Agent | LangChain + viem for wallet operations |
| Chain | Arc Testnet (USDC-native gas, sub-second finality) |
| Validation | Zod |

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- A [Supabase](https://supabase.com) project (free tier works)

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

Fill in your values:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
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

This creates seller and buyer wallet keypairs and writes them to `.env.local`.

### 4. Fund wallets

Go to [Circle Faucet](https://faucet.circle.com/) and fund both the seller and buyer addresses with testnet USDC on Arc Testnet.

### 5. Set up database

Run the Supabase migrations to create the `payment_events` and `withdrawals` tables:

```bash
npx supabase db push
```

Or apply them manually from `supabase/migrations/`.

### 6. Start dev server

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
| `npm run agent -- --limit 0.5` | Run agent with USDC spending limit |

## Project Structure

```
paygate/
├── app/
│   ├── layout.tsx                  # Root layout (theme, fonts, providers)
│   ├── page.tsx                    # Landing page
│   ├── error.tsx                   # Global error boundary
│   ├── not-found.tsx               # 404 page
│   ├── loading.tsx                 # Loading spinner
│   ├── actions.ts                  # Server actions (login/logout)
│   ├── globals.css                 # Global styles
│   ├── dashboard/
│   │   ├── layout.tsx              # Dashboard layout (nav, gateway controls)
│   │   ├── page.tsx                # Main dashboard (revenue, payments, withdrawals)
│   │   ├── agent/page.tsx          # Agent simulation viewer
│   │   └── status/page.tsx         # System health & endpoint status
│   ├── demo/page.tsx               # Checkout widget demo
│   ├── docs/page.tsx               # Documentation page
│   └── api/
│       ├── premium/
│       │   ├── quote/route.ts      # $0.001/call — Random quote
│       │   ├── weather/route.ts    # $0.002/call — Weather data
│       │   ├── compute/route.ts    # $0.0003/call — Text analysis (POST)
│       │   ├── dataset/route.ts    # $0.01/call — Analytics dataset
│       │   ├── joke/route.ts       # $0.0005/call — Programming joke
│       │   └── agent-task/route.ts # $0.03/call — Treasure hunt clue
│       └── gateway/
│           ├── balance/route.ts    # Gateway + wallet balance
│           └── withdraw/route.ts   # Withdraw USDC to other chains
├── components/
│   ├── checkout-widget.tsx         # Payment checkout component
│   ├── api-playground.tsx          # Interactive API tester
│   ├── theme-toggle.tsx            # Dark/light theme toggle
│   ├── dashboard/
│   │   ├── top-bar-gateway-controls.tsx  # Balance display + withdraw
│   │   ├── gateway-balance-dialog.tsx    # Detailed balance modal
│   │   └── withdraw-dialog.tsx           # Withdrawal form
│   └── ui/                         # shadcn/ui primitives
├── hooks/
│   ├── use-transactions.ts         # Real-time payment events (Supabase)
│   └── use-withdrawals.ts          # Real-time withdrawals (Supabase)
├── lib/
│   ├── x402.ts                     # Core withGateway() middleware
│   ├── rate-limit.ts               # In-memory rate limiter
│   ├── utils.ts                    # Utility functions
│   └── supabase/                   # Supabase client setup
├── supabase/
│   └── migrations/                 # Database schema (payment_events, withdrawals)
├── proxy.ts                        # Next.js middleware (auth redirects)
├── agent.mts                       # LangChain payment agent
├── generate-wallets.mts            # Wallet generation script
├── next.config.ts                  # Next.js config (security headers)
├── .env.example                    # Environment variable template
└── DOCUMENTATION.md                # Full project documentation
```

## Paywalled Endpoints

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| `/api/premium/quote` | GET | $0.001 | Random technology quote |
| `/api/premium/weather` | GET | $0.002 | Weather data for a random city |
| `/api/premium/compute` | POST | $0.0003 | Text analysis (word/sentence count) |
| `/api/premium/dataset` | GET | $0.01 | Sample analytics dataset |
| `/api/premium/joke` | GET | $0.0005 | Programming/crypto joke |
| `/api/premium/agent-task` | GET | $0.03 | Treasure hunt clue for agents |

All endpoints return `402 Payment Required` without a valid `payment-signature` header.

## AI Agent

The included agent (`agent.mts`) autonomously discovers and pays for paywalled endpoints:

```bash
# Run with default settings
npm run agent

# Run with a 0.5 USDC spending limit
npm run agent -- --limit 0.5
```

The agent generates an ephemeral wallet, funds it from the buyer wallet, deposits into Circle Gateway, and then cycles through all 6 premium endpoints — paying, consuming, and logging each response.

## Security

- **No hardcoded credentials** — Admin login reads from environment variables
- **Auth middleware** — `proxy.ts` redirects unauthenticated users away from `/dashboard`
- **Rate limiting** — 60 req/min on premium endpoints, 5 req/min on withdrawals
- **Input validation** — Zod schemas on POST endpoints
- **Security headers** — X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **CORS** — Proper Access-Control headers on all API responses
- **httpOnly cookies** — Session cookies are httpOnly and secure in production

## Documentation

See [DOCUMENTATION.md](./DOCUMENTATION.md) for the full technical reference, including:

- Detailed payment flow
- `withGateway()` middleware API
- Checkout widget integration
- Database schema
- Agent internals
- Deployment guide

## License

Apache-2.0 — See [LICENSE](./LICENSE) for details.
