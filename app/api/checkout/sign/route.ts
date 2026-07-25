/**
 * Server-side payment signing for the checkout widget.
 *
 * Accepts payment requirements from a 402 response, signs an EIP-3009
 * TransferWithAuthorization server-side using the buyer private key,
 * and returns the signed payment payload.
 *
 * This keeps private keys off the client.
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
    return NextResponse.json(
      { error: "Payment signing failed", message },
      { status: 500 },
    );
  }
}
