"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckoutWidget } from "@/components/checkout-widget";
import { ArrowLeft, Zap } from "lucide-react";

const DEMO_ENDPOINTS = [
  { path: "/api/premium/joke", method: "GET" as const, label: "Random Joke", price: "$0.0005" },
  { path: "/api/premium/quote", method: "GET" as const, label: "Inspirational Quote", price: "$0.001" },
  { path: "/api/premium/weather", method: "GET" as const, label: "Weather Data", price: "$0.002" },
  { path: "/api/premium/dataset", method: "GET" as const, label: "Analytics Dataset", price: "$0.01" },
];

export default function DemoPage() {
  const [selected, setSelected] = useState(0);

  const ep = DEMO_ENDPOINTS[selected];

  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-50 border-b backdrop-blur-md bg-background/80">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <Zap size={18} className="text-primary" />
              <span className="font-semibold">PayGate</span>
            </Link>
            <span className="text-muted-foreground text-sm">Checkout Demo</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/docs">
              <Button variant="outline" size="sm">Docs</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="sm">Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft size={14} />
          Back
        </Link>

        <div className="mb-10">
          <h1 className="text-2xl font-semibold mb-1">Checkout Widget</h1>
          <p className="text-muted-foreground text-sm max-w-lg">
            This is what your users see when they hit a paywalled endpoint.
            Select an API below and walk through the payment flow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start max-w-4xl">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Select an endpoint</h2>
            <div className="space-y-2">
              {DEMO_ENDPOINTS.map((ep, i) => (
                <button
                  key={ep.path}
                  onClick={() => setSelected(i)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    i === selected
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{ep.label}</p>
                      <code className="text-xs text-muted-foreground">{ep.method} {ep.path}</code>
                    </div>
                    <span className="text-sm font-mono">{ep.price}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-lg border px-4 py-3">
              <p className="text-xs font-medium mb-2">How it works</p>
              <ol className="text-xs text-muted-foreground space-y-1">
                <li>1. Click &quot;Check Price&quot; to hit the endpoint</li>
                <li>2. The endpoint returns 402 with payment requirements</li>
                <li>3. Click &quot;Pay&quot; to simulate a nanopayment signing</li>
                <li>4. In production, Circle Wallet signs the EIP-3009 auth</li>
              </ol>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Checkout widget</h2>
            <CheckoutWidget
              key={ep.path}
              endpoint={ep.path}
              method={ep.method}
            />
            <p className="text-xs text-muted-foreground text-center mt-4">
              In production, this connects to Circle Embedded Wallets
              for seamless USDC payments.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
