"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2, Wifi, Wallet, Server, Activity } from "lucide-react";

type HealthCheck = {
  status: "ok" | "error";
  latencyMs?: number;
  message?: string;
};

type HealthResponse = {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Record<string, HealthCheck>;
  timestamp: string;
};

const ENDPOINTS = [
  { path: "/api/premium/quote", method: "GET", price: "$0.001" },
  { path: "/api/premium/dataset", method: "GET", price: "$0.01" },
  { path: "/api/premium/compute", method: "POST", price: "$0.0003" },
  { path: "/api/premium/weather", method: "GET", price: "$0.002" },
  { path: "/api/premium/joke", method: "GET", price: "$0.0005" },
  { path: "/api/premium/agent-task", method: "GET", price: "$0.03" },
];

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <Loader2 size={14} className="animate-spin text-muted-foreground" />;
  if (ok) return <CheckCircle size={14} className="text-green-500" />;
  return <XCircle size={14} className="text-red-500" />;
}

function OverallBadge({ status }: { status: "healthy" | "degraded" | "unhealthy" | null }) {
  if (!status) return <Badge variant="secondary">Checking...</Badge>;
  const variant = status === "healthy" ? "default" : status === "degraded" ? "secondary" : "destructive";
  return <Badge variant={variant}>{status}</Badge>;
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [endpointStatus, setEndpointStatus] = useState<Record<string, boolean | null>>(
    Object.fromEntries(ENDPOINTS.map((e) => [e.path, null]))
  );

  useEffect(() => {
    // Fetch real health endpoint
    fetch("/api/health")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
        }
      })
      .catch(() => {})
      .finally(() => setHealthLoading(false));

    // Check each premium endpoint returns 402
    ENDPOINTS.forEach((ep) => {
      fetch(ep.path, {
        method: ep.method,
        ...(ep.method === "POST"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "health check" }) }
          : {}),
      })
        .then((res) => {
          setEndpointStatus((prev) => ({ ...prev, [ep.path]: res.status === 402 }));
        })
        .catch(() => {
          setEndpointStatus((prev) => ({ ...prev, [ep.path]: false }));
        });
    });
  }, []);

  const rpcCheck = health?.checks?.rpc;
  const gatewayCheck = health?.checks?.gateway;
  const supabaseCheck = health?.checks?.supabase;
  const walletCheck = health?.checks?.walletBalance;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">System Status</h1>
          <p className="text-muted-foreground text-sm">
            Health check for all PayGate services.
          </p>
        </div>
        <OverallBadge status={health?.status ?? null} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className="rounded-lg border px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Wifi size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">Arc RPC</span>
            <StatusDot ok={healthLoading ? null : rpcCheck ? rpcCheck.status === "ok" : null} />
          </div>
          <p className="text-xs text-muted-foreground font-mono">rpc.testnet.arc.network</p>
          {rpcCheck?.latencyMs != null && (
            <p className="text-xs text-muted-foreground mt-1">{rpcCheck.latencyMs}ms latency</p>
          )}
        </div>

        <div className="rounded-lg border px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">Gateway</span>
            <StatusDot ok={healthLoading ? null : gatewayCheck ? gatewayCheck.status === "ok" : null} />
          </div>
          <p className="text-xs text-muted-foreground font-mono">Circle Gateway API</p>
          {gatewayCheck?.latencyMs != null && (
            <p className="text-xs text-muted-foreground mt-1">{gatewayCheck.latencyMs}ms latency</p>
          )}
        </div>

        <div className="rounded-lg border px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Wallet size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">Wallet</span>
            <StatusDot ok={healthLoading ? null : walletCheck ? walletCheck.status === "ok" : null} />
          </div>
          {walletCheck?.message ? (
            <p className="text-lg font-semibold font-mono">
              {walletCheck.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Loading...</p>
          )}
        </div>

        <div className="rounded-lg border px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Server size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">Database</span>
            <StatusDot ok={healthLoading ? null : supabaseCheck ? supabaseCheck.status === "ok" : null} />
          </div>
          <p className="text-xs text-muted-foreground">
            {supabaseCheck?.message ?? "Supabase"}
          </p>
          {supabaseCheck?.latencyMs != null && (
            <p className="text-xs text-muted-foreground mt-1">{supabaseCheck.latencyMs}ms latency</p>
          )}
        </div>
      </div>

      <h2 className="text-sm font-medium text-muted-foreground mb-3">Endpoint Health</h2>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Endpoint</th>
              <th className="text-left px-4 py-3 font-medium">Method</th>
              <th className="text-right px-4 py-3 font-medium">Price</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map((ep) => (
              <tr key={ep.path} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{ep.path}</code>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono font-medium">{ep.method}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">{ep.price}</td>
                <td className="px-4 py-3 text-center">
                  <div className="inline-flex items-center gap-1.5">
                    <StatusDot ok={endpointStatus[ep.path]} />
                    <span className="text-xs">
                      {endpointStatus[ep.path] === null
                        ? "Checking..."
                        : endpointStatus[ep.path]
                          ? "402 OK"
                          : "Error"}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        All endpoints should return <code className="bg-muted px-1 py-0.5 rounded text-xs">402 Payment Required</code> when
        called without a payment header.
      </p>
    </div>
  );
}
