/**
 * Webhook delivery system.
 * Fires POST requests with payment event data + HMAC signature on each settlement.
 */

import { createHmac } from "crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  active: boolean;
  created_at: string;
}

export interface WebhookPayload {
  event: "payment.settled" | "payment.failed" | "withdrawal.confirmed" | "test";
  data: Record<string, unknown>;
  timestamp: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 9000]; // exponential backoff

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

let supabase: SupabaseClient | null = null;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (sbUrl.startsWith("http") && sbKey.length > 20) {
  supabase = createClient(sbUrl, sbKey);
}

export async function getWebhookEndpoints(): Promise<WebhookEndpoint[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select("*")
    .eq("active", true);

  if (error) {
    logger.error("webhooks", "Failed to fetch webhook endpoints", { error: error.message });
    return [];
  }

  return data as WebhookEndpoint[];
}

async function deliverWebhook(
  endpoint: WebhookEndpoint,
  payload: WebhookPayload,
): Promise<boolean> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, endpoint.secret);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PayGate-Signature": signature,
          "X-PayGate-Timestamp": payload.timestamp,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok || (res.status >= 200 && res.status < 300)) {
        logger.info("webhooks", `Delivered to ${endpoint.url}`, { attempt });
        return true;
      }

      logger.warn("webhooks", `Delivery failed (HTTP ${res.status})`, {
        url: endpoint.url,
        attempt,
      });
    } catch (err) {
      logger.warn("webhooks", `Delivery error`, {
        url: endpoint.url,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }

  logger.error("webhooks", `All retries exhausted for ${endpoint.url}`);
  return false;
}

/**
 * Fire webhook event to all active endpoints.
 * Non-blocking — does not throw on failure.
 */
export async function fireWebhook(
  event: WebhookPayload["event"],
  data: Record<string, unknown>,
): Promise<void> {
  const endpoints = await getWebhookEndpoints();
  if (endpoints.length === 0) return;

  const payload: WebhookPayload = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  // Fire all deliveries in parallel, don't block the caller
  Promise.allSettled(
    endpoints.map((ep) => deliverWebhook(ep, payload)),
  ).catch(() => {
    // Swallow — individual delivery errors already logged
  });
}
