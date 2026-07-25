"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Terminal } from "lucide-react";

const ENDPOINTS = [
  { path: "/api/premium/quote", method: "GET", price: "$0.001", desc: "Inspirational quote" },
  { path: "/api/premium/dataset", method: "GET", price: "$0.01", desc: "Analytics dataset" },
  { path: "/api/premium/compute", method: "POST", price: "$0.0003", desc: "Text analysis" },
  { path: "/api/premium/weather", method: "GET", price: "$0.002", desc: "Weather data" },
  { path: "/api/premium/joke", method: "GET", price: "$0.0005", desc: "Random joke" },
  { path: "/api/premium/agent-task", method: "GET", price: "$0.03", desc: "Agent treasure hunt" },
];

export function ApiPlayground() {
  const [selected, setSelected] = useState(0);
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const ep = ENDPOINTS[selected];

  async function hitEndpoint() {
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch(ep.path, {
        method: ep.method,
        ...(ep.method === "POST"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: "Hello from the playground!" }),
            }
          : {}),
      });
      const body = await res.json();
      setResponse({ status: res.status, body: JSON.stringify(body, null, 2) });
    } catch (err) {
      setResponse({ status: 0, body: String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-wrap gap-2 mb-4">
        {ENDPOINTS.map((e, i) => (
          <button
            key={e.path}
            onClick={() => { setSelected(i); setResponse(null); }}
            className={`text-xs font-mono px-3 py-1.5 rounded-md border transition-colors ${
              i === selected
                ? "border-primary bg-primary/10 text-primary"
                : "hover:bg-muted/50"
            }`}
          >
            <span className="font-medium">{e.method}</span>{" "}{e.path.replace("/api/premium/", "")}
          </button>
        ))}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
          <span className="text-xs font-mono font-medium text-primary">{ep.method}</span>
          <code className="text-sm font-mono flex-1">{ep.path}</code>
          <span className="text-xs text-muted-foreground font-mono">{ep.price} USDC</span>
          <Button size="sm" onClick={hitEndpoint} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Send
          </Button>
        </div>

        <div className="px-4 py-2 border-b bg-muted/10">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Terminal size={12} />
            <span>curl</span>
          </div>
          <code className="text-xs font-mono text-muted-foreground block overflow-x-auto">
            curl {ep.method === "POST" ? `-X POST -H "Content-Type: application/json" -d '{"text":"hello"}' ` : ""}
            {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}{ep.path}
          </code>
        </div>

        <div className="p-4 min-h-[200px]">
          {!response && !loading && (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              Click Send to hit this endpoint.
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              <Loader2 size={16} className="animate-spin mr-2" />
              Sending request...
            </div>
          )}
          {response && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium">Response</span>
                <span
                  className={`text-xs font-mono font-medium px-2 py-0.5 rounded ${
                    response.status === 402
                      ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                      : response.status === 200
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : "bg-red-500/10 text-red-600 dark:text-red-400"
                  }`}
                >
                  {response.status}
                  {response.status === 402 && " Payment Required"}
                  {response.status === 200 && " OK"}
                </span>
              </div>
              <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 overflow-x-auto max-h-[300px] overflow-y-auto leading-relaxed">
                {response.body}
              </pre>
              {response.status === 402 && (
                <p className="text-xs text-muted-foreground mt-3">
                  This endpoint requires a nanopayment of {ep.price} USDC.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
