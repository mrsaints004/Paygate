/**
 * Health check endpoint.
 * Returns status of all critical subsystems.
 */

import { NextResponse } from "next/server";
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import { network } from "@/lib/config";

type CheckResult = {
  status: "ok" | "error";
  latencyMs?: number;
  message?: string;
};

export async function GET() {
  const checks: Record<string, CheckResult> = {};

  // 1. Arc Testnet RPC
  const rpcStart = Date.now();
  try {
    const client = createPublicClient({ transport: http(network.rpcUrl) });
    await client.getBlockNumber();
    checks.rpc = { status: "ok", latencyMs: Date.now() - rpcStart };
  } catch (err) {
    checks.rpc = {
      status: "error",
      latencyMs: Date.now() - rpcStart,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // 2. Supabase connectivity
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (supabaseUrl.startsWith("http") && supabaseKey.length > 20) {
    const sbStart = Date.now();
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase
        .from("payment_events")
        .select("id")
        .limit(1);
      if (error) throw new Error(error.message);
      checks.supabase = { status: "ok", latencyMs: Date.now() - sbStart };
    } catch (err) {
      checks.supabase = {
        status: "error",
        latencyMs: Date.now() - sbStart,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  } else {
    checks.supabase = { status: "ok", message: "Not configured (using in-memory store)" };
  }

  // 3. Circle Gateway reachability
  const gwStart = Date.now();
  try {
    const res = await fetch(network.gatewayApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "USDC",
        sources: [{ domain: network.gatewayDomain, depositor: "0x0000000000000000000000000000000000000001" }],
      }),
    });
    if (res.ok || res.status === 400) {
      checks.gateway = { status: "ok", latencyMs: Date.now() - gwStart };
    } else {
      checks.gateway = {
        status: "error",
        latencyMs: Date.now() - gwStart,
        message: `HTTP ${res.status}`,
      };
    }
  } catch (err) {
    checks.gateway = {
      status: "error",
      latencyMs: Date.now() - gwStart,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // 4. Wallet balance check
  const sellerAddress = process.env.SELLER_ADDRESS as `0x${string}` | undefined;
  if (sellerAddress) {
    try {
      const client = createPublicClient({ transport: http(network.rpcUrl) });
      const balance = await client.readContract({
        address: network.usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [sellerAddress],
      });
      const formatted = formatUnits(balance, 6);
      checks.walletBalance = {
        status: parseFloat(formatted) > 0 ? "ok" : "error",
        message: `${formatted} USDC`,
      };
    } catch {
      checks.walletBalance = { status: "error", message: "Failed to query balance" };
    }
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok");
  const anyError = Object.values(checks).some((c) => c.status === "error");

  return NextResponse.json({
    status: allOk ? "healthy" : anyError ? "degraded" : "unhealthy",
    checks,
    timestamp: new Date().toISOString(),
  });
}
