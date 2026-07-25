"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, DollarSign, Play, Square, Zap, Activity, TrendingUp } from "lucide-react";

type PaymentEvent = {
  id: string;
  created_at: string;
  endpoint: string;
  payer: string;
  amount_usdc: string;
  network: string;
  gateway_tx: string | null;
};

type AgentLog = {
  id: string;
  timestamp: string;
  endpoint: string;
  amount: string;
  payer: string;
  isAgent: boolean;
  txHash: string | null;
};

/**
 * Heuristic agent detection.
 * A payer is flagged as an agent if they have >5 transactions in <60 seconds,
 * or if their address matches known agent prefixes.
 */
const KNOWN_AGENT_PREFIXES = ["0xa1b2", "0x1234", "0xdead"];

/** Threshold: payer with more than this many txns in a time window is an agent */
const AGENT_TX_THRESHOLD = 5;
/** Time window (ms) for agent detection heuristic */
const AGENT_WINDOW_MS = 60_000;

function detectAgentWallets(payments: PaymentEvent[]): Set<string> {
  const agents = new Set<string>();

  // Check known prefixes
  for (const p of payments) {
    const lower = p.payer.toLowerCase();
    if (KNOWN_AGENT_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      agents.add(p.payer);
    }
  }

  // Heuristic: group by payer, check for high-frequency bursts
  const byPayer = new Map<string, number[]>();
  for (const p of payments) {
    if (!byPayer.has(p.payer)) byPayer.set(p.payer, []);
    byPayer.get(p.payer)!.push(new Date(p.created_at).getTime());
  }

  for (const [payer, timestamps] of byPayer) {
    if (agents.has(payer)) continue;
    if (timestamps.length < AGENT_TX_THRESHOLD) continue;

    // Sort and check sliding window
    timestamps.sort((a, b) => a - b);
    for (let i = 0; i <= timestamps.length - AGENT_TX_THRESHOLD; i++) {
      if (timestamps[i + AGENT_TX_THRESHOLD - 1] - timestamps[i] < AGENT_WINDOW_MS) {
        agents.add(payer);
        break;
      }
    }
  }

  return agents;
}

function isAgentPayer(payer: string, agentSet?: Set<string>): boolean {
  if (agentSet) return agentSet.has(payer);
  const lower = payer.toLowerCase();
  return KNOWN_AGENT_PREFIXES.some((p) => lower.startsWith(p));
}

const ENDPOINTS = [
  { path: "/api/premium/quote", method: "GET", price: 0.001 },
  { path: "/api/premium/dataset", method: "GET", price: 0.01 },
  { path: "/api/premium/compute", method: "POST", price: 0.0003 },
  { path: "/api/premium/weather", method: "GET", price: 0.002 },
  { path: "/api/premium/joke", method: "GET", price: 0.0005 },
  { path: "/api/premium/agent-task", method: "GET", price: 0.03 },
];

export default function AgentViewerPage() {
  const [mode, setMode] = useState<"live" | "simulate">("live");
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [agentCount, setAgentCount] = useState(0);
  const [callCount, setCallCount] = useState(0);

  // Simulation state
  const [simRunning, setSimRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Live mode: poll /api/events
  useEffect(() => {
    if (mode !== "live") return;
    let active = true;

    async function poll() {
      try {
        const res = await fetch("/api/events");
        if (!res.ok || !active) return;
        const data = await res.json();
        const payments: PaymentEvent[] = data.payments ?? [];

        // Filter out protocol-fee entries
        const realPayments = payments.filter((p) => p.endpoint !== "protocol-fee");

        // Detect agents using heuristic (high-frequency payers)
        const detectedAgents = detectAgentWallets(realPayments);

        const mapped: AgentLog[] = realPayments.map((p) => ({
          id: p.id,
          timestamp: new Date(p.created_at).toISOString().slice(11, 19),
          endpoint: p.endpoint.replace("/api/premium/", ""),
          amount: p.amount_usdc,
          payer: p.payer,
          isAgent: isAgentPayer(p.payer, detectedAgents),
          txHash: p.gateway_tx,
        }));

        setLogs(mapped.slice(0, 100));
        setCallCount(realPayments.length);
        setTotalSpent(realPayments.reduce((sum, p) => sum + parseFloat(p.amount_usdc), 0));
        setAgentCount(detectedAgents.size);
      } catch { /* ignore */ }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [mode]);

  // Simulation mode
  const simulateCall = useCallback(async () => {
    const ep = ENDPOINTS[indexRef.current % ENDPOINTS.length];
    indexRef.current++;

    try {
      await fetch(ep.path, {
        method: ep.method,
        ...(ep.method === "POST"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Agent call" }) }
          : {}),
      });

      const log: AgentLog = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString().slice(11, 19),
        endpoint: ep.path.replace("/api/premium/", ""),
        amount: ep.price.toFixed(6),
        payer: "0xSimulated",
        isAgent: true,
        txHash: null,
      };

      setLogs((prev) => [log, ...prev].slice(0, 50));
      setCallCount((c) => c + 1);
      setTotalSpent((t) => t + ep.price);
    } catch { /* Network error */ }
  }, []);

  function startSim() {
    setSimRunning(true);
    simulateCall();
    intervalRef.current = setInterval(simulateCall, 1200);
  }

  function stopSim() {
    setSimRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Compute spending velocity (USDC per minute over last 10 entries)
  const velocity = logs.length >= 2
    ? (() => {
        const recent = logs.slice(0, 10);
        const totalAmt = recent.reduce((s, l) => s + parseFloat(l.amount), 0);
        return totalAmt / Math.max(recent.length * 0.02, 0.01); // rough per-min estimate
      })()
    : 0;

  // Endpoint preference breakdown
  const endpointCounts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.endpoint] = (acc[l.endpoint] ?? 0) + 1;
    return acc;
  }, {});
  const topEndpoints = Object.entries(endpointCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Bot size={20} className="text-muted-foreground" />
            Agent Viewer
          </h1>
          <p className="text-muted-foreground text-sm">
            {mode === "live"
              ? "Live payment data from real agent and human transactions."
              : "Simulates agent traffic against paywalled endpoints."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={mode === "live" ? "default" : "outline"}
            size="sm"
            onClick={() => { stopSim(); setMode("live"); }}
            className="gap-1.5"
          >
            <Activity size={14} /> Live
          </Button>
          <Button
            variant={mode === "simulate" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("simulate")}
            className="gap-1.5"
          >
            <Play size={14} /> Demo
          </Button>
          {mode === "simulate" && (
            simRunning ? (
              <Button variant="destructive" size="sm" onClick={stopSim} className="gap-2">
                <Square size={14} /> Stop
              </Button>
            ) : (
              <Button size="sm" onClick={startSim} className="gap-2">
                <Play size={14} /> Start
              </Button>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-lg border px-4 py-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <DollarSign size={13} />
            <span className="text-xs">Total Spend</span>
          </div>
          <p className="text-xl font-semibold font-mono">${totalSpent.toFixed(6)}</p>
        </div>
        <div className="rounded-lg border px-4 py-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Zap size={13} />
            <span className="text-xs">API Calls</span>
          </div>
          <p className="text-xl font-semibold font-mono">{callCount}</p>
        </div>
        <div className="rounded-lg border px-4 py-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Bot size={13} />
            <span className="text-xs">{mode === "live" ? "Agent Wallets" : "Status"}</span>
          </div>
          {mode === "live" ? (
            <p className="text-xl font-semibold font-mono">{agentCount}</p>
          ) : (
            <Badge variant={simRunning ? "default" : "secondary"} className="mt-1">
              {simRunning ? "Running" : "Stopped"}
            </Badge>
          )}
        </div>
        <div className="rounded-lg border px-4 py-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <TrendingUp size={13} />
            <span className="text-xs">Velocity</span>
          </div>
          <p className="text-xl font-semibold font-mono">${velocity.toFixed(4)}<span className="text-xs text-muted-foreground">/min</span></p>
        </div>
      </div>

      {/* Endpoint preference breakdown */}
      {topEndpoints.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Endpoint preferences</h2>
          <div className="flex flex-wrap gap-2">
            {topEndpoints.map(([ep, count]) => (
              <div key={ep} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{ep}</code>
                <span className="text-xs font-mono text-muted-foreground">{count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/50 flex items-center justify-between">
          <span className="text-xs font-medium">Activity Log</span>
          {(mode === "live" || simRunning) && (
            <span className="flex items-center gap-1.5 text-xs text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="px-4 py-12 text-center text-muted-foreground">
              {mode === "live"
                ? "No payments recorded yet. Run `npm run agent` to generate traffic."
                : 'Click "Start" to begin simulation.'}
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50">
                  <span className="text-muted-foreground w-16">{log.timestamp}</span>
                  {log.isAgent ? (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">Agent</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Human</Badge>
                  )}
                  <code className="bg-muted px-1.5 py-0.5 rounded flex-1">{log.endpoint}</code>
                  <span className="text-foreground font-medium">${log.amount}</span>
                  <span className="text-muted-foreground w-24 text-right truncate">
                    {log.payer.slice(0, 6)}...{log.payer.slice(-4)}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-4">
        Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">npm run agent</code> for
        the real AI agent with live USDC payments, or{" "}
        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">npm run marketplace</code> for
        agent-to-agent commerce.
      </p>
    </div>
  );
}
