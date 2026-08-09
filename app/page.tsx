"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Zap, Shield, BarChart3, Bot, DollarSign, Code, Menu, X, Clock, Globe, Cpu, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiPlayground } from "@/components/api-playground";
import { LiveStats } from "@/components/live-stats";

function ComparisonTable() {
  const rows = [
    { feature: "Min. transaction", paygate: "$0.000001", stripe: "$0.50+", crypto: "$0.01+", lightning: "$0.00001" },
    { feature: "Fee per tx", paygate: "1%", stripe: "$0.30 + 2.9%", crypto: "$0.01-50+", lightning: "~0.1%" },
    { feature: "Agent compatible", paygate: "Native", stripe: "No", crypto: "Manual", lightning: "Partial" },
    { feature: "Settlement speed", paygate: "<500ms", stripe: "2-7 days", crypto: "1-60 min", lightning: "<5s" },
    { feature: "Integration", paygate: "1 line", stripe: "SDK + dashboard", crypto: "Smart contract", lightning: "Node + channels" },
    { feature: "No wallet popup", paygate: "Yes", stripe: "N/A", crypto: "No", lightning: "No" },
  ];

  return (
    <div className="max-w-4xl mx-auto overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4 font-medium text-muted-foreground" />
            <th className="text-center py-3 px-4 font-semibold text-primary">PayGate</th>
            <th className="text-center py-3 px-4 font-medium text-muted-foreground">Stripe</th>
            <th className="text-center py-3 px-4 font-medium text-muted-foreground">Crypto Wallets</th>
            <th className="text-center py-3 px-4 font-medium text-muted-foreground">Lightning</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feature} className="border-b last:border-0">
              <td className="py-3 px-4 font-medium">{row.feature}</td>
              <td className="py-3 px-4 text-center font-mono text-xs font-semibold text-primary">{row.paygate}</td>
              <td className="py-3 px-4 text-center font-mono text-xs text-muted-foreground">{row.stripe}</td>
              <td className="py-3 px-4 text-center font-mono text-xs text-muted-foreground">{row.crypto}</td>
              <td className="py-3 px-4 text-center font-mono text-xs text-muted-foreground">{row.lightning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceComparison() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
      <div className="rounded-lg border px-5 py-5">
        <p className="text-sm font-medium text-destructive mb-2">Stripe</p>
        <p className="text-3xl font-bold font-mono">$0.30</p>
        <p className="text-sm text-muted-foreground mt-1">+ 2.9% per transaction</p>
        <p className="text-xs text-muted-foreground mt-3">
          Fee on a $0.001 API call: <span className="font-mono font-semibold text-destructive">30,100%</span>
        </p>
      </div>
      <div className="rounded-lg border border-primary/40 px-5 py-5">
        <p className="text-sm font-medium text-primary mb-2">PayGate</p>
        <p className="text-3xl font-bold font-mono">1%</p>
        <p className="text-sm text-muted-foreground mt-1">No gas fees, no minimums</p>
        <p className="text-xs text-muted-foreground mt-3">
          Minimum charge: <span className="font-mono font-semibold text-primary">$0.000001</span>
        </p>
      </div>
    </div>
  );
}

function CodeExample() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-lg border overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/50">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/20" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
            <div className="w-3 h-3 rounded-full bg-green-500/20" />
          </div>
          <span className="text-xs text-muted-foreground font-mono">route.ts</span>
        </div>
        <pre className="p-4 text-sm font-mono overflow-x-auto leading-relaxed">
          <code>
            <span className="text-muted-foreground">{"// Protect any endpoint with one line"}</span>{"\n"}
            <span className="text-blue-500 dark:text-blue-400">{"import"}</span>{" { withGateway } "}<span className="text-blue-500 dark:text-blue-400">from</span>{" "}<span className="text-green-600 dark:text-emerald-400">{'"@/lib/x402"'}</span>{";\n\n"}
            <span className="text-blue-500 dark:text-blue-400">{"const"}</span>{" handler = "}<span className="text-blue-500 dark:text-blue-400">{"async"}</span>{" (req) => {\n"}
            {"  "}<span className="text-blue-500 dark:text-blue-400">{"return"}</span>{" NextResponse.json({\n"}
            {"    weather: "}<span className="text-green-600 dark:text-emerald-400">{'"sunny"'}</span>{",\n"}
            {"    temp: "}<span className="text-orange-500 dark:text-orange-400">{"72"}</span>{"\n"}
            {"  });\n"}
            {"};\n\n"}
            <span className="text-muted-foreground">{"// This endpoint now costs $0.001 per call"}</span>{"\n"}
            <span className="text-blue-500 dark:text-blue-400">{"export const"}</span>{" GET = withGateway(handler, "}
            <span className="text-green-600 dark:text-emerald-400">{'"$0.001"'}</span>{", "}
            <span className="text-green-600 dark:text-emerald-400">{'"weather"'}</span>{");"}
          </code>
        </pre>
      </div>
    </div>
  );
}

const LANDING_NAV = [
  { href: "#endpoints", label: "Live Demo" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "/demo", label: "Checkout" },
  { href: "/docs", label: "Docs" },
];

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-50 border-b backdrop-blur-md bg-background/80">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-primary" />
            <span className="font-semibold">PayGate</span>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            {LANDING_NAV.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {link.label}
              </Link>
            ))}
            <Link href="/dashboard">
              <Button variant="outline" size="sm">Dashboard</Button>
            </Link>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden inline-flex items-center justify-center rounded-md border h-8 w-8 hover:bg-muted transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={14} /> : <Menu size={14} />}
          </button>
        </div>
        {mobileOpen && (
          <div className="sm:hidden border-t px-6 py-2 flex flex-col gap-1">
            {LANDING_NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm px-3 py-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="text-sm px-3 py-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
          </div>
        )}
      </nav>

      <LiveStats />

      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-medium text-primary mb-4">Powered by Arc Nanopayments</p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-5 leading-[1.15]">
            APIs are free because charging $0.001 was impossible. Until now.
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            Drop-in SDK for sub-cent API payments. One line of code.
            Works for humans and AI agents. Real USDC. No gas fees.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="#endpoints">
              <Button size="lg" className="gap-2">
                Try Live Demo <ArrowRight size={16} />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg">
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 border-t">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <h2 className="text-2xl font-bold mb-2">Why now?</h2>
          <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
            Three things changed that make micropayments finally possible.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          <Card className="border bg-transparent">
            <CardContent className="pt-5 pb-5">
              <DollarSign size={18} className="text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">Traditional payments failed</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Stripe&apos;s $0.30 minimum makes a $0.001 API call carry a 30,100% fee. Micropayments were mathematically impossible.
              </p>
            </CardContent>
          </Card>
          <Card className="border bg-transparent">
            <CardContent className="pt-5 pb-5">
              <Layers size={18} className="text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">Crypto gas was too high</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                On-chain payments cost $0.01-50+ per transaction. Arc batches thousands of payments into one settlement, making gas negligible.
              </p>
            </CardContent>
          </Card>
          <Card className="border bg-transparent">
            <CardContent className="pt-5 pb-5">
              <Cpu size={18} className="text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">AI agents need money</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                LLMs need to pay for APIs programmatically. x402 makes HTTP-native payments — agents pay as naturally as they fetch data.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-16 px-6 border-t">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <h2 className="text-2xl font-bold mb-2">The agent economy</h2>
          <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
            AI agents are the first customers that can&apos;t use Stripe.
            They need programmatic, sub-cent payments. x402 gives them that.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <div className="rounded-lg border p-5">
            <Bot size={18} className="text-muted-foreground mb-3" />
            <h3 className="text-sm font-medium mb-2">Agent discovers APIs</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Agents call <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/api/discover</code> to find all available endpoints with prices. They evaluate cost vs value and decide what to buy.
            </p>
            <code className="text-xs bg-muted px-2 py-1 rounded block font-mono text-muted-foreground">
              GET /api/discover → [{"{endpoint, price, description}"}]
            </code>
          </div>
          <div className="rounded-lg border p-5">
            <Zap size={18} className="text-muted-foreground mb-3" />
            <h3 className="text-sm font-medium mb-2">Agent pays automatically</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              No wallet popup. No browser. The agent signs an EIP-3009 nanopayment, attaches it as an HTTP header, and gets instant access.
            </p>
            <code className="text-xs bg-muted px-2 py-1 rounded block font-mono text-muted-foreground">
              GET /api/premium/quote + payment-signature → 200 OK
            </code>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 border-t">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <h2 className="text-2xl font-bold mb-2">Why PayGate exists</h2>
          <p className="text-muted-foreground text-sm">
            Traditional payment processors charge a minimum of $0.30 per transaction.
            That makes micropayments mathematically impossible.
          </p>
        </div>
        <PriceComparison />
      </section>

      <section id="how-it-works" className="py-16 px-6 border-t">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <h2 className="text-2xl font-bold mb-2">One line of code</h2>
          <p className="text-muted-foreground text-sm">
            Wrap any Next.js or Express endpoint with a nanopayment gate.
            No smart contracts. No wallet integration.
          </p>
        </div>
        <CodeExample />
      </section>

      <section className="py-16 px-6 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-2">The x402 payment flow</h2>
          <p className="text-muted-foreground text-sm text-center mb-10">
            Every API call follows this flow. Humans use the checkout widget. AI agents do it automatically.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { step: "1", label: "Request", desc: "Client calls API" },
              { step: "2", label: "402", desc: "Server returns price" },
              { step: "3", label: "Sign", desc: "EIP-3009 payment" },
              { step: "4", label: "Retry", desc: "With payment header" },
              { step: "5", label: "Verify", desc: "Gateway settles" },
              { step: "6", label: "Serve", desc: "Response delivered" },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-9 h-9 rounded-full border flex items-center justify-center mx-auto mb-2 font-mono text-sm font-medium text-muted-foreground">
                  {s.step}
                </div>
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center mt-8">
            <Link href="/demo">
              <Button variant="outline" size="sm" className="gap-2">
                Try Checkout Widget <ArrowRight size={14} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 border-t">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <h2 className="text-2xl font-bold mb-2">How PayGate compares</h2>
          <p className="text-muted-foreground text-sm">
            No existing solution handles sub-cent, agent-native, instant API payments.
          </p>
        </div>
        <ComparisonTable />
      </section>

      <section className="py-16 px-6 border-t">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">Built for the future</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: DollarSign, title: "Sub-cent payments", desc: "Charge as low as $0.000001 per call. Circle Gateway batches thousands of payments into one on-chain transaction." },
              { icon: Bot, title: "AI agent compatible", desc: "Agents pay via x402 protocol — no browser, no wallet popup. They sign a nanopayment authorization and get instant access." },
              { icon: BarChart3, title: "Real-time dashboard", desc: "Monitor revenue, track per-endpoint performance, see human vs agent traffic, and withdraw earnings." },
              { icon: Code, title: "Developer-first SDK", desc: "One import. One wrapper function. Set your price per endpoint. PayGate handles 402 responses and settlement." },
              { icon: Shield, title: "Cryptographic verification", desc: "Every payment is cryptographically signed via EIP-3009. Circle Gateway verifies before serving any response." },
              { icon: Zap, title: "Sub-second settlement", desc: "Built on Arc — Circle's stablecoin-native L1 with USDC as the gas token. Payments verify in under 500ms." },
            ].map((f) => (
              <Card key={f.title} className="border bg-transparent">
                <CardContent className="pt-5 pb-5">
                  <f.icon size={18} className="text-muted-foreground mb-3" />
                  <h3 className="text-sm font-medium mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="endpoints" className="py-16 px-6 border-t">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-2">Try it live</h2>
          <p className="text-muted-foreground text-sm text-center mb-8">
            These endpoints are paywalled right now. Hit one — you&apos;ll get a 402 Payment Required.
          </p>
          <ApiPlayground />
          <p className="text-xs text-muted-foreground text-center mt-4">
            Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">npm run agent</code> to
            watch an AI agent autonomously pay for and consume these endpoints.
          </p>
        </div>
      </section>

      <section className="py-20 px-6 border-t">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-3">
            Your API is free because Stripe can&apos;t charge $0.001.
          </h2>
          <p className="text-muted-foreground mb-8">PayGate can.</p>
          <Link href="/dashboard">
            <Button size="lg" className="gap-2">
              Open Dashboard <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t py-6 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">PayGate</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Programmable Money Hackathon (Encode x Arc) — 2026
          </p>
        </div>
      </footer>
    </main>
  );
}
