/**
 * Webhook endpoint management API.
 * CRUD operations for webhook URLs (requires authentication).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { logger } from "@/lib/logger";
import { fireWebhook } from "@/lib/webhooks";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function getSupabase() {
  if (!supabaseUrl.startsWith("http") || supabaseKey.length <= 20) {
    return null;
  }
  return createClient(supabaseUrl, supabaseKey);
}

async function requireAuth(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session || session.value !== "authenticated") {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  return null;
}

// List all webhook endpoints
export async function GET() {
  const authErr = await requireAuth();
  if (authErr) return authErr;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured — webhooks require a database" },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select("id, url, active, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ endpoints: data });
}

const CreateWebhookBody = z.object({
  url: z.string().url("Must be a valid URL"),
});

// Create a new webhook endpoint
export async function POST(req: NextRequest) {
  const authErr = await requireAuth();
  if (authErr) return authErr;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured — webhooks require a database" },
      { status: 503 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = CreateWebhookBody.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const secret = randomBytes(32).toString("hex");

  const { data, error } = await supabase
    .from("webhook_endpoints")
    .insert({
      url: parsed.data.url,
      secret,
      active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info("webhooks", `Created webhook endpoint: ${parsed.data.url}`);

  return NextResponse.json({
    id: data.id,
    url: data.url,
    secret,
    active: data.active,
    created_at: data.created_at,
  }, { status: 201 });
}

const DeleteWebhookBody = z.object({
  id: z.string().uuid(),
});

// Delete a webhook endpoint
export async function DELETE(req: NextRequest) {
  const authErr = await requireAuth();
  if (authErr) return authErr;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = DeleteWebhookBody.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("webhook_endpoints")
    .delete()
    .eq("id", parsed.data.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

const TestWebhookBody = z.object({
  id: z.string().uuid(),
});

// Test a webhook endpoint (sends sample payload)
export async function PUT(req: NextRequest) {
  const authErr = await requireAuth();
  if (authErr) return authErr;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = TestWebhookBody.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { data: endpoint, error } = await supabase
    .from("webhook_endpoints")
    .select("*")
    .eq("id", parsed.data.id)
    .single();

  if (error || !endpoint) {
    return NextResponse.json({ error: "Webhook endpoint not found" }, { status: 404 });
  }

  await fireWebhook("test", {
    message: "This is a test webhook from PayGate",
    endpoint_id: endpoint.id,
  });

  return NextResponse.json({ sent: true });
}
