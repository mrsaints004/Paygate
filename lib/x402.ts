/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addPayment } from "@/lib/payment-store";
import { network, PROTOCOL_FEE_RATE } from "@/lib/config";
import { logger } from "@/lib/logger";
import {
  PaymentValidationError,
  GatewayError,
  toHttpStatus,
} from "@/lib/errors";

export const sellerAddress = process.env.SELLER_ADDRESS as `0x${string}`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, payment-signature",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
};

const facilitator = new BatchFacilitatorClient();

// Supabase is optional — payment flow works without it, events just log to console
let supabase: SupabaseClient | null = null;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (supabaseUrl.startsWith("http") && supabaseKey.length > 20) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

// Price validation schema — validated at middleware initialization time
const priceSchema = z
  .string()
  .regex(/^\$?\d+(\.\d+)?$/, "Price must be a dollar amount like '$0.001' or '0.001'")
  .transform((v) => v.replace("$", ""))
  .pipe(
    z
      .string()
      .refine((v) => {
        const n = parseFloat(v);
        return n >= 0.000001 && n <= 10000;
      }, "Price must be between $0.000001 and $10,000"),
  );

interface PaymentPayload {
  x402Version: number;
  resource?: { url: string; description: string; mimeType: string };
  accepted?: Record<string, unknown>;
  payload: {
    signature?: string;
    authorization?: Record<string, unknown>;
    [key: string]: unknown;
  };
  extensions?: Record<string, unknown>;
}

interface SettlementResult {
  success: boolean;
  transaction?: string;
  errorReason?: string;
  payer?: string;
}

function buildPaymentRequirements(priceUsdc: string) {
  const amount = Math.round(parseFloat(priceUsdc) * 1_000_000);

  return {
    scheme: "exact" as const,
    network: network.networkId,
    asset: network.usdcAddress,
    amount: amount.toString(),
    payTo: sellerAddress,
    maxTimeoutSeconds: 345600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: network.gatewayWallet,
    },
  };
}

async function insertWithRetry(
  client: SupabaseClient,
  table: string,
  data: Record<string, unknown>,
) {
  const { error } = await client.from(table).insert(data);
  if (error) {
    // Retry once after 500ms
    await new Promise((r) => setTimeout(r, 500));
    const { error: retryError } = await client.from(table).insert(data);
    if (retryError) {
      logger.error("supabase", `Failed to record to ${table} after retry`, {
        error: retryError.message,
      });
    }
  }
}

/**
 * Wraps a Next.js route handler with Circle Gateway payment verification.
 *
 * Price is validated at initialization time via Zod, so malformed prices
 * fail immediately rather than at request time.
 */
export function withGateway(
  handler: (req: NextRequest) => Promise<NextResponse>,
  price: string,
  endpoint: string,
) {
  // Validate price at initialization time
  const parsed = priceSchema.safeParse(price);
  if (!parsed.success) {
    throw new PaymentValidationError(
      `Invalid price "${price}" for ${endpoint}: ${parsed.error.issues[0].message}`,
    );
  }

  const requirements = buildPaymentRequirements(parsed.data);

  return async (req: NextRequest) => {
    const paymentSignature = req.headers.get("payment-signature");

    // No payment — return 402 with Gateway batching payment requirements
    if (!paymentSignature) {
      logger.info("x402", `402 Payment Required: ${endpoint}`);

      const paymentRequired = {
        x402Version: 2,
        resource: {
          url: endpoint,
          description: `Paid resource ($${parsed.data} USDC)`,
          mimeType: "application/json",
        },
        accepts: [requirements],
      };

      return new NextResponse(JSON.stringify({}), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": Buffer.from(
            JSON.stringify(paymentRequired),
          ).toString("base64"),
          ...CORS_HEADERS,
        },
      });
    }

    // Payment present — verify and settle via Circle Gateway
    let paymentPayload: PaymentPayload;
    try {
      paymentPayload = JSON.parse(
        Buffer.from(paymentSignature, "base64").toString("utf-8"),
      );
    } catch {
      return NextResponse.json(
        { error: "Malformed payment header — expected base64-encoded JSON" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    if (!paymentPayload.payload || typeof paymentPayload.x402Version !== "number") {
      return NextResponse.json(
        { error: "Invalid payment payload structure" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    try {
      let verifyResult: { isValid: boolean; invalidReason?: string; payer?: string };
      try {
        verifyResult = await facilitator.verify(paymentPayload, requirements);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new GatewayError(`Circle Gateway unreachable: ${msg}`);
      }

      if (!verifyResult.isValid) {
        return NextResponse.json(
          {
            error: "Payment verification failed",
            reason: verifyResult.invalidReason,
          },
          { status: 402, headers: CORS_HEADERS },
        );
      }

      let settleResult: SettlementResult;
      try {
        settleResult = await facilitator.settle(
          paymentPayload,
          requirements,
        ) as SettlementResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new GatewayError(`Settlement failed: ${msg}`);
      }

      if (!settleResult.success) {
        logger.error("x402", `Settlement failed for ${endpoint}`, {
          reason: settleResult.errorReason,
        });
        return NextResponse.json(
          {
            error: "Payment settlement failed",
            reason: settleResult.errorReason,
          },
          { status: 402, headers: CORS_HEADERS },
        );
      }

      // Record payment event
      const amountUsdc = (Number(requirements.amount) / 1e6).toString();
      const payer = settleResult.payer ?? verifyResult.payer ?? "unknown";

      // Always write to in-memory store (dashboard fallback)
      addPayment({
        endpoint,
        payer,
        amount_usdc: amountUsdc,
        network: requirements.network,
        gateway_tx: settleResult.transaction ?? null,
        raw: { requirements, settleResult },
      });

      // Also write to Supabase if configured (with retry)
      if (supabase) {
        insertWithRetry(supabase, "payment_events", {
          endpoint,
          payer,
          amount_usdc: amountUsdc,
          network: requirements.network,
          gateway_tx: settleResult.transaction ?? null,
          raw: { requirements, settleResult },
        });
      }

      // Protocol take-rate
      const feeUsdc = (Number(amountUsdc) * PROTOCOL_FEE_RATE).toFixed(6);
      if (parseFloat(feeUsdc) > 0) {
        const feeData = {
          endpoint: "protocol-fee",
          payer: endpoint,
          amount_usdc: feeUsdc,
          network: requirements.network,
          gateway_tx: settleResult.transaction ?? null,
          raw: { type: "protocol-fee", sourceEndpoint: endpoint, rate: PROTOCOL_FEE_RATE },
        };

        addPayment(feeData);
        if (supabase) {
          insertWithRetry(supabase, "payment_events", feeData);
        }
      }

      logger.info("x402", `Payment settled: ${endpoint}`, {
        amount: amountUsdc,
        payer,
        fee: feeUsdc,
        tx: settleResult.transaction,
      });

      // Call the actual route handler
      const response = await handler(req);

      // Forward settlement info to the client
      const settleResponseHeader = Buffer.from(
        JSON.stringify({
          success: true,
          transaction: settleResult.transaction,
          network: requirements.network,
          payer,
        }),
      ).toString("base64");

      response.headers.set("PAYMENT-RESPONSE", settleResponseHeader);
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        response.headers.set(key, value);
      }
      return response;
    } catch (error) {
      if (error instanceof GatewayError) {
        logger.error("x402", error.message);
        return NextResponse.json(
          { error: "Payment gateway error", message: error.message },
          { status: 502, headers: CORS_HEADERS },
        );
      }

      const message =
        error instanceof Error ? error.message : String(error);
      logger.error("x402", `Payment processing error: ${message}`);
      return NextResponse.json(
        { error: "Payment processing error", message },
        { status: toHttpStatus(error), headers: CORS_HEADERS },
      );
    }
  };
}
