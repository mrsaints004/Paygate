/**
 * Server-side payment signing for the checkout widget.
 *
 * Uses GatewayClient (same as the agent) to ensure USDC is deposited
 * into Circle Gateway before signing. The buyer's private key stays
 * on the server — never sent to the browser.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { network } from "@/lib/config";

const limiter = rateLimit(60_000, 30);

const SignRequestBody = z.object({
  paymentRequired: z.object({
    x402Version: z.number(),
    resource: z
      .object({
        url: z.string(),
        description: z.string(),
        mimeType: z.string(),
      })
      .optional(),
    accepts: z.array(
      z.object({
        scheme: z.string(),
        network: z.string(),
        asset: z.string(),
        amount: z.string(),
        payTo: z.string(),
        maxTimeoutSeconds: z.number(),
        extra: z.record(z.unknown()).optional(),
      }),
    ),
  }),
});

// Cache the GatewayClient so we don't re-deposit on every request.
// The deposit only needs to happen once (or when balance runs low).
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

      // Deposit USDC into Gateway so payments can settle.
      // Check balance first — skip deposit if already funded.
      try {
        const balances = await client.getBalances();
        const MIN_BALANCE = 100_000n; // 0.1 USDC in 6-decimal units
        if (balances.gateway.available < MIN_BALANCE) {
          // Deposit a small amount for checkout demos
          const depositAmount = "0.5";
          logger.info("checkout", `Depositing ${depositAmount} USDC into Gateway for checkout...`);
          await client.deposit(depositAmount);
          logger.info("checkout", "Gateway deposit complete");
        } else {
          logger.info("checkout", `Gateway balance sufficient: ${balances.gateway.formattedAvailable}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("checkout", `Gateway deposit failed: ${msg}`);
        // Reset so next request retries
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

  const buyerKey = process.env.BUYER_PRIVATE_KEY;
  if (!buyerKey) {
    return NextResponse.json(
      { error: "BUYER_PRIVATE_KEY not configured on server" },
      { status: 500 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = SignRequestBody.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    // Ensure Gateway client is initialized and funded
    const gateway = await getOrCreateGatewayClient();

    // Check balance before signing — re-deposit if too low
    try {
      const balances = await gateway.getBalances();
      const accepts = parsed.data.paymentRequired.accepts[0];
      const requiredAmount = BigInt(accepts?.amount ?? "0");

      if (balances.gateway.available < requiredAmount) {
        logger.info("checkout", "Gateway balance too low, re-depositing...");
        gatewayClientPromise = null; // Force re-init with fresh deposit
        await getOrCreateGatewayClient();
      }
    } catch {
      // Balance check failed — proceed anyway, payment will fail clearly if insufficient
    }

    // Sign using x402 client (same approach as before, but now Gateway is funded)
    const { ExactEvmScheme, toClientEvmSigner } = await import("@x402/evm");
    const { x402Client } = await import("@x402/core/client");
    const { createPublicClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { arcTestnet } = await import("viem/chains");

    const account = privateKeyToAccount(buyerKey as `0x${string}`);
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(network.rpcUrl),
    });

    const signer = toClientEvmSigner(account, publicClient);
    const scheme = new ExactEvmScheme(signer);

    const client = new x402Client();
    client.register(
      network.networkId as `${string}:${string}`,
      scheme,
    );

    const paymentPayload = await client.createPaymentPayload(
      parsed.data.paymentRequired as Parameters<typeof client.createPaymentPayload>[0],
    );

    const paymentSignature = Buffer.from(
      JSON.stringify(paymentPayload),
    ).toString("base64");

    logger.info("checkout", "Payment signed server-side", {
      payer: account.address,
    });

    return NextResponse.json({
      paymentSignature,
      payer: account.address,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("checkout", `Signing failed: ${message}`);
    // Reset gateway client on error so next request retries
    gatewayClientPromise = null;
    return NextResponse.json(
      { error: "Payment signing failed", message },
      { status: 500 },
    );
  }
}
