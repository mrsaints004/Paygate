/**
 * PayGate Intelligent Payment Agent
 *
 * An autonomous agent that:
 * 1. Discovers available endpoints via /api/discover
 * 2. Evaluates cost vs value with explicit reasoning
 * 3. Makes budget-aware purchasing decisions
 * 4. Logs reasoning traces for demo visibility
 *
 * Uses real USDC on Arc Testnet via Circle Gateway.
 *
 * Usage:
 *   npm run agent                -- run with default settings
 *   npm run agent -- --limit 0.5 -- run with USDC spending limit
 */

import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  createWalletClient,
  createPublicClient,
  http,
  erc20Abi,
  parseUnits,
  parseEther,
} from "viem";
import { arcTestnet } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import * as readline from "node:readline/promises";

// ============================================================================
// CLI Args
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  let spendingLimit: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      const val = parseFloat(args[i + 1]);
      if (isNaN(val) || val <= 0) {
        console.error("--limit must be a positive number (USDC amount)");
        process.exit(1);
      }
      spendingLimit = val;
      i++;
    }
  }

  return { spendingLimit };
}

let { spendingLimit } = parseArgs();
let totalSpent = 0;
let paused = false;

// ============================================================================
// Agent Constants
// ============================================================================

/** Fraction of remaining budget at which an endpoint is flagged as expensive */
const BUDGET_DANGER_RATIO = 0.5;

/** Value-per-dollar threshold above which an endpoint is "high" priority */
const VPD_HIGH_THRESHOLD = 50;

/** Value-per-dollar threshold above which an endpoint is "medium" priority */
const VPD_MEDIUM_THRESHOLD = 10;

/** Value penalty applied when an endpoint consumes too much of remaining budget */
const EXPENSIVE_PENALTY = 3;

/** Maximum consecutive payment failures before pausing the agent loop */
const MAX_CONSECUTIVE_FAILURES = 3;

/** Initial backoff delay (ms) after a payment failure */
const BACKOFF_INITIAL_MS = 1000;

/** Maximum backoff delay (ms) after repeated payment failures */
const BACKOFF_MAX_MS = 30000;

// ============================================================================
// Reasoning Engine
// ============================================================================

interface DiscoveredEndpoint {
  endpoint: string;
  method: string;
  price: string;
  price_usdc: number;
  description: string;
}

interface EndpointEvaluation {
  endpoint: string;
  price: number;
  valueScore: number;  // 1-10
  reason: string;
  priority: "high" | "medium" | "low" | "skip";
}

function log(prefix: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${prefix}] ${msg}`);
}

function reason(msg: string) {
  log("REASONING", `\x1b[36m${msg}\x1b[0m`);
}

function decision(msg: string) {
  log("DECISION", `\x1b[33m${msg}\x1b[0m`);
}

function action(msg: string) {
  log("ACTION", `\x1b[32m${msg}\x1b[0m`);
}

function evaluateEndpoints(
  endpoints: DiscoveredEndpoint[],
  budget: number,
  spent: number,
): EndpointEvaluation[] {
  const remaining = budget - spent;
  reason(`Budget analysis: $${budget.toFixed(6)} total, $${spent.toFixed(6)} spent, $${remaining.toFixed(6)} remaining`);

  return endpoints.map((ep) => {
    // Value heuristics based on endpoint type and price
    let valueScore: number;
    let reasonText: string;

    if (ep.endpoint.includes("dataset")) {
      valueScore = 8;
      reasonText = "High-value structured data, useful for analysis";
    } else if (ep.endpoint.includes("weather")) {
      valueScore = 7;
      reasonText = "Real-time data with practical applications";
    } else if (ep.endpoint.includes("compute")) {
      valueScore = 9;
      reasonText = "Cheapest endpoint, computational utility, high ROI";
    } else if (ep.endpoint.includes("agent-task")) {
      valueScore = 6;
      reasonText = "Complex task, highest price but unique value";
    } else if (ep.endpoint.includes("quote")) {
      valueScore = 5;
      reasonText = "Low cost, moderate information value";
    } else if (ep.endpoint.includes("joke")) {
      valueScore = 3;
      reasonText = "Entertainment, low information density";
    } else {
      valueScore = 5;
      reasonText = "Unknown endpoint, default evaluation";
    }

    // Adjust for budget constraints
    const costRatio = ep.price_usdc / remaining;
    if (costRatio > BUDGET_DANGER_RATIO) {
      valueScore = Math.max(1, valueScore - EXPENSIVE_PENALTY);
      reasonText += ` [EXPENSIVE: ${(costRatio * 100).toFixed(1)}% of remaining budget]`;
    }

    // Value per dollar (higher = better deal)
    const vpd = valueScore / (ep.price_usdc * 1000);

    let priority: "high" | "medium" | "low" | "skip";
    if (ep.price_usdc > remaining) {
      priority = "skip";
    } else if (vpd > VPD_HIGH_THRESHOLD) {
      priority = "high";
    } else if (vpd > VPD_MEDIUM_THRESHOLD) {
      priority = "medium";
    } else {
      priority = "low";
    }

    return {
      endpoint: ep.endpoint,
      price: ep.price_usdc,
      valueScore,
      reason: reasonText,
      priority,
    };
  });
}

// ============================================================================
// Wallet Setup
// ============================================================================

const funderKey = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!funderKey) {
  console.error("Missing BUYER_PRIVATE_KEY. Run `npm run generate-wallets` first.");
  process.exit(1);
}

// Network constants — keep in sync with lib/config.ts
// (agent runs as standalone script so can't use Next.js path aliases)
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_TESTNET_RPC = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DEPOSIT_AMOUNT = process.env.DEPOSIT_AMOUNT ?? "1";
const GAS_FUND_AMOUNT = parseEther("0.01");

if (spendingLimit !== null) {
  console.log(`Spending limit: ${spendingLimit} USDC`);
}

async function promptForAllowance(): Promise<number> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      "\nSpending limit reached. Enter additional allowance in USDC (or 0 to quit): ",
    );
    const val = parseFloat(answer);
    if (isNaN(val) || val < 0) {
      console.error("Invalid amount. Exiting.");
      process.exit(0);
    }
    if (val === 0) {
      console.log(`Agent stopped. Total spent: ${totalSpent.toFixed(6)} USDC`);
      process.exit(0);
    }
    return val;
  } finally {
    rl.close();
  }
}

// Nonce retry helper
async function withNonceRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = (err as Error).message ?? "";
      const isNonceError =
        msg.includes("replacement transaction underpriced") ||
        msg.includes("nonce too low") ||
        msg.includes("already known");
      if (!isNonceError || attempt === 4) throw err;
      const delay = 1000 + Math.random() * 2000;
      console.log(`  ${label}: nonce collision, retrying in ${Math.round(delay)}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

// ============================================================================
// Main Agent Loop
// ============================================================================

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║              PayGate Intelligent Payment Agent              ║");
console.log("║     Discovery → Evaluation → Budget-Aware Purchasing       ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

// --- Generate ephemeral wallet ---
const ephemeralKey = generatePrivateKey();
const ephemeralAccount = privateKeyToAccount(ephemeralKey);
log("WALLET", `Ephemeral agent wallet: ${ephemeralAccount.address}`);

// --- Fund the ephemeral wallet ---
const funderAccount = privateKeyToAccount(funderKey);
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC),
});
const funderWallet = createWalletClient({
  account: funderAccount,
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC),
});

log("FUND", `Funding from funder ${funderAccount.address}...`);

const usdcAmount = parseUnits(DEPOSIT_AMOUNT, 6);

const gasTxHash = await withNonceRetry(
  () => funderWallet.sendTransaction({ to: ephemeralAccount.address, value: GAS_FUND_AMOUNT }),
  "Gas tx",
);
await publicClient.waitForTransactionReceipt({ hash: gasTxHash });
log("FUND", `Gas funded (${gasTxHash.slice(0, 10)}...)`);

const usdcTxHash = await withNonceRetry(
  () => funderWallet.writeContract({
    address: ARC_TESTNET_USDC,
    abi: erc20Abi,
    functionName: "transfer",
    args: [ephemeralAccount.address, usdcAmount],
  }),
  "USDC tx",
);
await publicClient.waitForTransactionReceipt({ hash: usdcTxHash });
log("FUND", `USDC transferred (${usdcTxHash.slice(0, 10)}...)`);

// --- Create GatewayClient ---
const gateway = new GatewayClient({
  chain: "arcTestnet",
  privateKey: ephemeralKey,
});

log("GATEWAY", `Depositing ${DEPOSIT_AMOUNT} USDC into Gateway Wallet...`);
const depositResult = await gateway.deposit(DEPOSIT_AMOUNT);
log("GATEWAY", `Deposit complete! TX: ${depositResult.depositTxHash}`);
const balances = await gateway.getBalances();
log("GATEWAY", `Available balance: ${balances.gateway.formattedAvailable}`);

// ============================================================================
// Phase 1: Discovery
// ============================================================================

reason("Phase 1: Discovering available endpoints...");
let endpoints: DiscoveredEndpoint[] = [];

try {
  const discoverRes = await fetch(`${BASE_URL}/api/discover`);
  const catalog = await discoverRes.json();
  endpoints = catalog.endpoints;
  reason(`Discovered ${endpoints.length} paywalled endpoints:`);
  for (const ep of endpoints) {
    reason(`  ${ep.method} ${ep.endpoint} — $${ep.price_usdc} — ${ep.description.slice(0, 50)}`);
  }
} catch (err) {
  reason(`Discovery failed, falling back to hardcoded endpoints: ${(err as Error).message}`);
  endpoints = [
    { endpoint: "/api/premium/quote", method: "GET", price: "$0.001", price_usdc: 0.001, description: "Quote" },
    { endpoint: "/api/premium/dataset", method: "GET", price: "$0.01", price_usdc: 0.01, description: "Dataset" },
    { endpoint: "/api/premium/compute", method: "POST", price: "$0.0003", price_usdc: 0.0003, description: "Compute" },
    { endpoint: "/api/premium/agent-task", method: "GET", price: "$0.03", price_usdc: 0.03, description: "Agent task" },
    { endpoint: "/api/premium/weather", method: "GET", price: "$0.002", price_usdc: 0.002, description: "Weather" },
    { endpoint: "/api/premium/joke", method: "GET", price: "$0.0005", price_usdc: 0.0005, description: "Joke" },
  ];
}

// ============================================================================
// Phase 2: Evaluation
// ============================================================================

reason("Phase 2: Evaluating endpoints by cost/value...");
const budget = spendingLimit ?? parseFloat(DEPOSIT_AMOUNT);
const evaluations = evaluateEndpoints(endpoints, budget, totalSpent);

// Sort by priority then value score
const priorityOrder = { high: 0, medium: 1, low: 2, skip: 3 };
evaluations.sort((a, b) => {
  const po = priorityOrder[a.priority] - priorityOrder[b.priority];
  if (po !== 0) return po;
  return b.valueScore - a.valueScore;
});

reason("Evaluation results:");
for (const ev of evaluations) {
  reason(`  [${ev.priority.toUpperCase()}] ${ev.endpoint} — value: ${ev.valueScore}/10 — ${ev.reason}`);
}

// ============================================================================
// Phase 3: Purchasing
// ============================================================================

reason("Phase 3: Executing purchase plan...");

const purchasable = evaluations.filter((ev) => ev.priority !== "skip");
decision(`Will purchase from ${purchasable.length} endpoints in priority order`);

let inFlight = 0;
let redepositing = false;
let consecutiveFailures = 0;
let currentBackoffMs = 0;
let paymentInterval: ReturnType<typeof setInterval>;
let balanceInterval: ReturnType<typeof setInterval>;

const REDEPOSIT_THRESHOLD = 500_000n;

async function depositToGateway() {
  log("GATEWAY", `Depositing ${DEPOSIT_AMOUNT} USDC into Gateway Wallet...`);
  const result = await gateway.deposit(DEPOSIT_AMOUNT);
  log("GATEWAY", `Deposit complete! TX: ${result.depositTxHash}`);
}

async function refundAndRedeposit() {
  const txHash = await withNonceRetry(
    () => funderWallet.writeContract({
      address: ARC_TESTNET_USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [ephemeralAccount.address, usdcAmount],
    }),
    "Redeposit tx",
  );
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  await depositToGateway();
}

async function checkAndRedeposit() {
  if (redepositing || paused) return;
  redepositing = true;
  try {
    const bal = await gateway.getBalances();
    if (bal.gateway.available < REDEPOSIT_THRESHOLD) {
      reason(`Gateway balance low (${bal.gateway.formattedAvailable}), redepositing...`);
      if (bal.wallet.balance > 0n) {
        await depositToGateway();
      } else {
        await refundAndRedeposit();
      }
    }
  } catch (err) {
    console.error("Balance check failed:", (err as Error).message);
  } finally {
    redepositing = false;
  }
}

balanceInterval = setInterval(checkAndRedeposit, 30_000);

let purchaseIndex = 0;
let roundNumber = 0;

async function handleLimitReached() {
  if (spendingLimit === null) return;
  paused = true;
  clearInterval(paymentInterval);
  clearInterval(balanceInterval);

  while (inFlight > 0) {
    await new Promise((r) => setTimeout(r, 100));
  }

  decision(`Spent $${totalSpent.toFixed(6)} / $${spendingLimit.toFixed(6)} USDC (limit reached)`);

  const additional = await promptForAllowance();
  spendingLimit += additional;
  decision(`New limit: $${spendingLimit.toFixed(6)} USDC`);

  paused = false;
  startPaymentLoop();
}

function startPaymentLoop() {
  balanceInterval = setInterval(checkAndRedeposit, 30_000);

  paymentInterval = setInterval(() => {
    if (paused) return;

    // Re-evaluate on each new round
    if (purchaseIndex % purchasable.length === 0 && purchaseIndex > 0) {
      roundNumber++;
      reason(`Starting round ${roundNumber + 1} — re-evaluating priorities...`);
    }

    const ev = purchasable[purchaseIndex % purchasable.length];
    const ep = endpoints.find((e) => e.endpoint === ev.endpoint)!;
    purchaseIndex++;
    inFlight++;

    // Pre-purchase reasoning
    const remaining = (spendingLimit ?? parseFloat(DEPOSIT_AMOUNT)) - totalSpent;
    reason(`Considering ${ep.endpoint} ($${ev.price}) — value: ${ev.valueScore}/10, remaining budget: $${remaining.toFixed(6)}`);

    if (ev.price > remaining) {
      decision(`SKIP: ${ep.endpoint} costs $${ev.price} but only $${remaining.toFixed(6)} remaining`);
      inFlight--;
      return;
    }

    decision(`BUY: ${ep.endpoint} — good value at ${ev.valueScore}/10 for $${ev.price}`);

    const url = `${BASE_URL}${ep.endpoint}`;
    const start = Date.now();

    gateway
      .pay(url, {
        method: ep.method as "GET" | "POST",
        body: ep.method === "POST" ? { text: "Intelligent agent purchase" } : undefined,
      })
      .then((result) => {
        inFlight--;
        consecutiveFailures = 0;
        currentBackoffMs = 0;
        const ms = Date.now() - start;
        const amount = parseFloat(result.formattedAmount);
        totalSpent += amount;

        const limitInfo = spendingLimit !== null
          ? ` [spent: $${totalSpent.toFixed(6)}/$${spendingLimit.toFixed(6)}]`
          : ` [total: $${totalSpent.toFixed(6)}]`;

        action(
          `#${purchaseIndex} ${ep.method} ${ep.endpoint.split("/").pop()} → $${result.formattedAmount} (${ms}ms) [in-flight: ${inFlight}]${limitInfo}`,
        );

        if (spendingLimit !== null && totalSpent >= spendingLimit) {
          handleLimitReached();
        }
      })
      .catch(async (err) => {
        inFlight--;
        consecutiveFailures++;
        const ms = Date.now() - start;
        console.error(
          `#${purchaseIndex} ${ep.endpoint.split("/").pop()} FAILED (${ms}ms): ${err.message}`,
        );

        // Exponential backoff on failures
        currentBackoffMs = Math.min(
          currentBackoffMs === 0 ? BACKOFF_INITIAL_MS : currentBackoffMs * 2,
          BACKOFF_MAX_MS,
        );

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          reason(`${consecutiveFailures} consecutive failures — pausing for ${currentBackoffMs}ms`);
          paused = true;
          await new Promise((r) => setTimeout(r, currentBackoffMs));
          paused = false;
          reason("Resuming after backoff");
        }
      });
  }, 1000);
}

action(`Starting payment loop — ${purchasable.length} endpoints, 1 tx/second\n`);
startPaymentLoop();
