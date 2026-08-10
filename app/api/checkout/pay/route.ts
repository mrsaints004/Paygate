/**
 * Server-side payment endpoint for the checkout widget.
 *
 * Uses GatewayClient.pay() (same as the agent) to handle the full
 * x402 batched payment flow: hit the endpoint, get 402, sign, retry,
 * and return the response + settlement info.
 *
 * This keeps private keys on the server and ensures compatibility
 * with the BatchFacilitatorClient used by the middleware.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const limiter = rateLimit(60_000, 30);

const PayRequestBody = z.object({
  endpoint: z.string().startsWith("/api/premium/"),
  method: z.enum(["GET", "POST"]).default("GET"),
  body: z.record(z.unknown()).optional(),
});

// Cache the GatewayClient across requests
let gatewayClientPromise: Promise<InstanceType<
  typeof import("@circle-fin/x402-batching/client").GatewayClient
>> | null = null;

async function getOrCreateGatewayClient() {
  const buyerKey = process.env.BUYER_PRIVATE_KEY;
  if (!buyerKey) {
    throw new Error("BUYER_PRIVATE_KEY not configured on server");
  }

  if (!gatewayClientPromise) {
    gatewayClientPromise = (async () => {
      const { GatewayClient } = await import("@circle-fin/x402-batching/client");

      const client = new GatewayClient({
        chain: "arcTestnet",
        privateKey: buyerKey as `0x${string}`,
      });

      // Deposit USDC into Gateway if balance is low
      try {
        const balances = await client.getBalances();
        const MIN_BALANCE = BigInt(100_000); // 0.1 USDC
        if (balances.gateway.available < MIN_BALANCE) {
          const depositAmount = "0.5";
          logger.info("checkout", `Depositing ${depositAmount} USDC into Gateway...`);
          await client.deposit(depositAmount);
          logger.info("checkout", "Gateway deposit complete");
        } else {
          logger.info("checkout", `Gateway balance sufficient: ${balances.gateway.formattedAvailable}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("checkout", `Gateway deposit failed: ${msg}`);
        gatewayClientPromise = null;
        throw err;
      }

      return client;
    })();
  }

  return gatewayClientPromise;
}

export async function POST(req: NextRequest) {
  const limited = limiter(req);
  if (limited) return limited;

  const raw = await req.json().catch(() => ({}));
  const parsed = PayRequestBody.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { endpoint, method, body } = parsed.data;

  try {
    const gateway = await getOrCreateGatewayClient();

    // Check balance before paying — re-deposit if too low
    try {
      const balances = await gateway.getBalances();
      if (balances.gateway.available < BigInt(100_000)) {
        logger.info("checkout", "Gateway balance low, re-depositing...");
        gatewayClientPromise = null;
        await getOrCreateGatewayClient();
      }
    } catch {
      // Proceed anyway
    }

    // Build full URL for the endpoint
    const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const url = `${baseUrl}${endpoint}`;

    logger.info("checkout", `Paying for ${method} ${endpoint}...`);

    // GatewayClient.pay() does the full x402 flow:
    // 1. Hits the endpoint, gets 402
    // 2. Signs the batched payment
    // 3. Retries with payment signature
    // 4. Returns the response
    const result = await gateway.pay(url, {
      method: method as "GET" | "POST",
      body: body,
    });

    logger.info("checkout", `Payment settled: ${endpoint}`, {
      amount: result.formattedAmount,
      payer: process.env.BUYER_ADDRESS,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
      amount: result.formattedAmount,
      transaction: result.transaction,
      payer: process.env.BUYER_ADDRESS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("checkout", `Payment failed: ${message}`);
    // Reset gateway client on error
    gatewayClientPromise = null;
    return NextResponse.json(
      { error: "Payment failed", message },
      { status: 500 },
    );
  }
}
