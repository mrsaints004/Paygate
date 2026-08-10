/**
 * Look up x402 transfer status from Circle Gateway.
 *
 * GET /api/transfers?id=<batch-uuid>
 * GET /api/transfers              (lists recent transfers)
 *
 * Uses GatewayClient.getTransferById() and searchTransfers() to
 * surface on-chain settlement status for batch payments.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Reuse the same cached GatewayClient pattern
let gatewayClientPromise: Promise<InstanceType<
  typeof import("@circle-fin/x402-batching/client").GatewayClient
>> | null = null;

async function getGatewayClient() {
  const buyerKey = process.env.BUYER_PRIVATE_KEY;
  if (!buyerKey) {
    throw new Error("BUYER_PRIVATE_KEY not configured");
  }

  if (!gatewayClientPromise) {
    gatewayClientPromise = (async () => {
      const { GatewayClient } = await import("@circle-fin/x402-batching/client");
      return new GatewayClient({
        chain: "arcTestnet",
        privateKey: buyerKey as `0x${string}`,
      });
    })();
  }

  return gatewayClientPromise;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  try {
    const gateway = await getGatewayClient();

    if (id) {
      // Look up a specific transfer by batch ID
      const transfer = await gateway.getTransferById(id);
      const t = transfer as Record<string, unknown>;
      logger.info("transfers", `Looked up transfer ${id}`, {
        status: t.status,
        keys: Object.keys(t),
      });
      return NextResponse.json({ transfer: t }, { headers: CORS_HEADERS });
    }

    // List recent transfers
    const result = await gateway.searchTransfers({ pageSize: 20 });
    return NextResponse.json(
      { transfers: result.transfers, pagination: result.pagination },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("transfers", `Transfer lookup failed: ${message}`);
    gatewayClientPromise = null;
    return NextResponse.json(
      { error: "Transfer lookup failed", message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
