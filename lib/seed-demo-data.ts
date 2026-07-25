/**
 * Seed realistic demo payment data when the in-memory store is empty.
 * Only runs once — won't override real payment data.
 */

import { addPayment, addWithdrawal, getPayments } from "@/lib/payment-store";

const ENDPOINTS = [
  { endpoint: "/api/premium/quote", price: "0.001000" },
  { endpoint: "/api/premium/weather", price: "0.002000" },
  { endpoint: "/api/premium/compute", price: "0.000300" },
  { endpoint: "/api/premium/dataset", price: "0.010000" },
  { endpoint: "/api/premium/joke", price: "0.000500" },
  { endpoint: "/api/premium/agent-task", price: "0.030000" },
];

const PAYERS = [
  // Agent wallets (recognizable patterns)
  "0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2",
  "0x1234567890ABCDEF1234567890ABCDEF12345678",
  "0xDeadBeefCafe0000DeadBeefCafe0000DeadBeef",
  // Human wallets
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  "0xE592427A0AEce92De3Edee1F18E0157C05861564",
];

const AGENT_PAYERS = new Set(PAYERS.slice(0, 3));

const NETWORK = "eip155:5042002";

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTxHash(): string {
  const chars = "0123456789abcdef";
  let hash = "0x";
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

let seeded = false;

export function seedDemoData() {
  if (seeded) return;
  if (getPayments().length > 0) {
    seeded = true;
    return;
  }

  seeded = true;
  const now = Date.now();
  const sixHoursAgo = now - 6 * 60 * 60 * 1000;
  const eventCount = randomBetween(60, 85);

  // Generate timestamps spread over 6 hours with realistic clustering
  const timestamps: number[] = [];
  for (let i = 0; i < eventCount; i++) {
    // Cluster more events toward recent time
    const t = sixHoursAgo + Math.pow(Math.random(), 0.7) * (now - sixHoursAgo);
    timestamps.push(t);
  }
  timestamps.sort((a, b) => a - b);

  // Weight endpoints: quote/weather/joke are most popular, dataset/agent-task less frequent
  const weightedEndpoints = [
    ...Array(8).fill(ENDPOINTS[0]), // quote
    ...Array(6).fill(ENDPOINTS[1]), // weather
    ...Array(4).fill(ENDPOINTS[2]), // compute
    ...Array(2).fill(ENDPOINTS[3]), // dataset
    ...Array(5).fill(ENDPOINTS[4]), // joke
    ...Array(1).fill(ENDPOINTS[5]), // agent-task
  ];

  for (const ts of timestamps) {
    const ep = randomItem(weightedEndpoints);
    const payer = randomItem(PAYERS);

    addPayment({
      endpoint: ep.endpoint,
      payer,
      amount_usdc: ep.price,
      network: NETWORK,
      gateway_tx: generateTxHash(),
      raw: null,
    }, new Date(ts).toISOString());
  }

  // Add 3 withdrawal records
  const withdrawalData = [
    { amount: "0.500000", chain: "base-sepolia", status: "confirmed" as const, hoursAgo: 4 },
    { amount: "0.250000", chain: "arc-testnet", status: "confirmed" as const, hoursAgo: 2 },
    { amount: "0.100000", chain: "arbitrum-sepolia", status: "submitted" as const, hoursAgo: 0.5 },
  ];

  for (const w of withdrawalData) {
    const ts = new Date(now - w.hoursAgo * 60 * 60 * 1000).toISOString();
    addWithdrawal({
      amount_usdc: w.amount,
      destination_chain: w.chain,
      destination_address: "0xb79d2188a17B76605439508c626561F8F23c5B77",
      status: w.status,
      tx_hash: w.status === "confirmed" ? generateTxHash() : null,
    }, ts);
  }

  console.log(`[seed] Seeded ${eventCount} demo payment events and 3 withdrawals`);
}
