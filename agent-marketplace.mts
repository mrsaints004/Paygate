/**
 * Multi-Agent Marketplace Demo
 *
 * Demonstrates agent-to-agent commerce on PayGate:
 * - Agent A ("Data Provider") wraps endpoints selling AI-generated market insights
 * - Agent B ("Data Consumer") discovers endpoints, evaluates cost vs value, and purchases
 *
 * Both agents settle in real USDC on Arc Testnet via Circle Gateway.
 *
 * Usage: npm run marketplace
 */

import { GatewayClient } from "@circle-fin/x402-batching/client";
import {
  createWalletClient,
  createPublicClient,
  http,
  erc20Abi,
  parseUnits,
  parseEther,
  formatUnits,
} from "viem";
import { arcTestnet } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DEPOSIT_AMOUNT = "0.5"; // Each agent gets 0.5 USDC

const funderKey = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!funderKey) {
  console.error("Missing BUYER_PRIVATE_KEY. Run `npm run generate-wallets` first.");
  process.exit(1);
}

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

// Retry helper for nonce collisions
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

interface DiscoveredEndpoint {
  endpoint: string;
  method: string;
  price: string;
  price_usdc: number;
  description: string;
}

// ============================================================================
// Agent Setup
// ============================================================================

async function setupAgent(name: string): Promise<{ gateway: GatewayClient; address: string }> {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  console.log(`\n[${name}] Wallet: ${account.address}`);

  // Fund with gas
  const gasTx = await withNonceRetry(
    () => funderWallet.sendTransaction({ to: account.address, value: parseEther("0.01") }),
    `${name} gas`,
  );
  await publicClient.waitForTransactionReceipt({ hash: gasTx });

  // Fund with USDC
  const usdcTx = await withNonceRetry(
    () => funderWallet.writeContract({
      address: ARC_TESTNET_USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [account.address, parseUnits(DEPOSIT_AMOUNT, 6)],
    }),
    `${name} USDC`,
  );
  await publicClient.waitForTransactionReceipt({ hash: usdcTx });
  console.log(`[${name}] Funded with ${DEPOSIT_AMOUNT} USDC`);

  // Create Gateway client and deposit
  const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: key });
  console.log(`[${name}] Depositing into Gateway...`);
  const deposit = await gateway.deposit(DEPOSIT_AMOUNT);
  console.log(`[${name}] Deposit TX: ${deposit.depositTxHash.slice(0, 12)}...`);

  return { gateway, address: account.address };
}

// ============================================================================
// Agent B: Data Consumer — discovers, evaluates, and purchases
// ============================================================================

async function runConsumerAgent(gateway: GatewayClient, agentName: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${agentName}] Starting consumer agent...`);
  console.log(`${"=".repeat(60)}`);

  // Step 1: Discover available endpoints
  console.log(`\n[${agentName}] STEP 1: Discovering available endpoints...`);
  const discoverRes = await fetch(`${BASE_URL}/api/discover`);
  const catalog = await discoverRes.json();
  const endpoints: DiscoveredEndpoint[] = catalog.endpoints;

  console.log(`[${agentName}] Found ${endpoints.length} endpoints:`);
  for (const ep of endpoints) {
    console.log(`  ${ep.method} ${ep.endpoint} — $${ep.price_usdc} — ${ep.description.slice(0, 60)}...`);
  }

  // Step 2: Evaluate cost vs value (budget-aware reasoning)
  console.log(`\n[${agentName}] STEP 2: Evaluating cost vs value...`);
  const budget = parseFloat(DEPOSIT_AMOUNT);
  let spent = 0;

  // Sort by price ascending — buy cheap data first
  const sorted = [...endpoints].sort((a, b) => a.price_usdc - b.price_usdc);

  // Filter by budget
  const affordable = sorted.filter((ep) => ep.price_usdc <= budget - spent);
  console.log(`[${agentName}] Budget: $${budget} | Affordable endpoints: ${affordable.length}`);

  // Step 3: Purchase data from each affordable endpoint
  console.log(`\n[${agentName}] STEP 3: Purchasing data...`);

  let purchaseCount = 0;
  for (const ep of affordable) {
    if (spent + ep.price_usdc > budget * 0.8) {
      console.log(`[${agentName}] Budget limit (80%) reached at $${spent.toFixed(6)}. Stopping.`);
      break;
    }

    const url = `${BASE_URL}${ep.endpoint}`;
    const start = Date.now();

    try {
      const result = await gateway.pay(url, {
        method: ep.method as "GET" | "POST",
        body: ep.method === "POST" ? { text: "Multi-agent marketplace demo" } : undefined,
      });

      const ms = Date.now() - start;
      const amount = parseFloat(result.formattedAmount);
      spent += amount;
      purchaseCount++;

      console.log(
        `[${agentName}] #${purchaseCount} ${ep.method} ${ep.endpoint.split("/").pop()} → $${result.formattedAmount} (${ms}ms) [spent: $${spent.toFixed(6)}]`,
      );
    } catch (err) {
      console.error(`[${agentName}] FAILED ${ep.endpoint}: ${(err as Error).message}`);
    }

    // Brief delay between calls
    await new Promise((r) => setTimeout(r, 800));
  }

  // Step 4: Make a second pass on high-value endpoints
  console.log(`\n[${agentName}] STEP 4: Second pass — re-purchasing valuable endpoints...`);
  const highValue = affordable.filter((ep) => ep.price_usdc <= 0.002);

  for (const ep of highValue.slice(0, 3)) {
    if (spent + ep.price_usdc > budget * 0.95) break;

    const url = `${BASE_URL}${ep.endpoint}`;
    try {
      const result = await gateway.pay(url, {
        method: ep.method as "GET" | "POST",
        body: ep.method === "POST" ? { text: "Second pass analysis" } : undefined,
      });
      spent += parseFloat(result.formattedAmount);
      purchaseCount++;
      console.log(`[${agentName}] Re-purchase: ${ep.endpoint.split("/").pop()} → $${result.formattedAmount}`);
    } catch (err) {
      console.error(`[${agentName}] Re-purchase FAILED: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n[${agentName}] SUMMARY: ${purchaseCount} purchases, $${spent.toFixed(6)} spent`);
  return { purchaseCount, spent };
}

// ============================================================================
// Agent A: Data Provider — simply makes its own purchases to simulate a provider
// ============================================================================

async function runProviderAgent(gateway: GatewayClient, agentName: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${agentName}] Starting provider agent...`);
  console.log(`${"=".repeat(60)}`);

  // The provider agent also consumes endpoints to aggregate data
  const endpoints = [
    { url: `${BASE_URL}/api/premium/weather`, method: "GET" as const },
    { url: `${BASE_URL}/api/premium/quote`, method: "GET" as const },
    { url: `${BASE_URL}/api/premium/dataset`, method: "GET" as const },
    { url: `${BASE_URL}/api/premium/joke`, method: "GET" as const },
  ];

  let spent = 0;
  let count = 0;

  for (let round = 0; round < 3; round++) {
    for (const ep of endpoints) {
      try {
        const start = Date.now();
        const result = await gateway.pay(ep.url, { method: ep.method });
        const ms = Date.now() - start;
        const amount = parseFloat(result.formattedAmount);
        spent += amount;
        count++;

        console.log(
          `[${agentName}] #${count} ${ep.url.split("/").pop()} → $${result.formattedAmount} (${ms}ms)`,
        );
      } catch (err) {
        console.error(`[${agentName}] FAILED: ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  console.log(`\n[${agentName}] SUMMARY: ${count} purchases, $${spent.toFixed(6)} spent`);
  return { purchaseCount: count, spent };
}

// ============================================================================
// Main
// ============================================================================

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║          PayGate Multi-Agent Marketplace Demo              ║");
console.log("║  Two agents discovering, evaluating, and trading via USDC  ║");
console.log("╚══════════════════════════════════════════════════════════════╝");

// Fund both agents sequentially to avoid nonce collisions
console.log("\nSetting up agents...");
const [agentA, agentB] = [
  await setupAgent("Provider"),
  await setupAgent("Consumer"),
];

// Run both agents concurrently
const [providerResult, consumerResult] = await Promise.all([
  runProviderAgent(agentA.gateway, "Provider"),
  runConsumerAgent(agentB.gateway, "Consumer"),
]);

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║                    MARKETPLACE SUMMARY                      ║");
console.log("╠══════════════════════════════════════════════════════════════╣");
console.log(`║  Provider: ${providerResult.purchaseCount} calls, $${providerResult.spent.toFixed(6)} spent`.padEnd(63) + "║");
console.log(`║  Consumer: ${consumerResult.purchaseCount} calls, $${consumerResult.spent.toFixed(6)} spent`.padEnd(63) + "║");
const totalCalls = providerResult.purchaseCount + consumerResult.purchaseCount;
const totalSpent = providerResult.spent + consumerResult.spent;
console.log(`║  Total: ${totalCalls} calls, $${totalSpent.toFixed(6)} USDC settled on-chain`.padEnd(63) + "║");
console.log("╚══════════════════════════════════════════════════════════════╝");

process.exit(0);
