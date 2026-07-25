import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/50">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/20" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
          <div className="w-3 h-3 rounded-full bg-green-500/20" />
        </div>
        <span className="text-xs text-muted-foreground font-mono">{title}</span>
      </div>
      <pre className="p-4 text-sm font-mono overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function DocsPage() {
  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-50 border-b backdrop-blur-md bg-background/80">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <Zap size={18} className="text-primary" />
              <span className="font-semibold">PayGate</span>
            </Link>
            <span className="text-muted-foreground text-sm">Docs</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft size={14} />
          Back
        </Link>

        <h1 className="text-2xl font-semibold mb-1">Getting Started</h1>
        <p className="text-muted-foreground text-sm mb-10">
          Add nanopayment paywalls to any API endpoint in under 5 minutes.
        </p>

        <section className="mb-12">
          <h2 className="text-lg font-medium mb-1">1. Install dependencies</h2>
          <p className="text-muted-foreground text-sm mb-4">
            PayGate uses Circle&apos;s x402-batching SDK for payment verification and settlement.
          </p>
          <CodeBlock
            title="terminal"
            code={`npm install @circle-fin/x402-batching @x402/core @x402/evm viem`}
          />
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-medium mb-1">2. Set up the middleware</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Create a gateway wrapper that verifies nanopayments before serving responses.
          </p>
          <CodeBlock
            title="lib/paygate.ts"
            code={`import { NextRequest, NextResponse } from "next/server";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching";

const facilitator = new BatchFacilitatorClient();

export function withGateway(
  handler: (req: NextRequest) => Promise<NextResponse>,
  price: string,    // e.g. "$0.001"
  endpoint: string  // e.g. "/api/weather"
) {
  return async (req: NextRequest) => {
    const payment = req.headers.get("payment-signature");

    if (!payment) {
      return NextResponse.json(
        {
          error: "Payment Required",
          price,
          endpoint,
          accepts: "x402",
          payTo: process.env.SELLER_ADDRESS,
          network: "eip155:5042002",
        },
        { status: 402 }
      );
    }

    const result = await facilitator.verifyAndSettle({
      paymentHeader: payment,
      resourceUrl: endpoint,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: "Payment verification failed" },
        { status: 402 }
      );
    }

    const response = await handler(req);
    response.headers.set("PAYMENT-RESPONSE", JSON.stringify(result));
    return response;
  };
}`}
          />
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-medium mb-1">3. Protect your endpoint</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Wrap any route handler with one line. Set the price per call in USDC.
          </p>
          <CodeBlock
            title="app/api/weather/route.ts"
            code={`import { NextRequest, NextResponse } from "next/server";
import { withGateway } from "@/lib/paygate";

const handler = async (req: NextRequest) => {
  return NextResponse.json({
    city: "San Francisco",
    temp: 64,
    condition: "foggy",
  });
};

export const GET = withGateway(handler, "$0.002", "/api/weather");`}
          />
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-medium mb-1">4. Configure environment</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Set your seller wallet address. Generate one with the included script.
          </p>
          <CodeBlock
            title=".env.local"
            code={`SELLER_ADDRESS=0xYourWalletAddress
SELLER_PRIVATE_KEY=0xYourPrivateKey

# Optional: Supabase for payment logging
NEXT_PUBLIC_SUPABASE_URL=your-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`}
          />
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-medium mb-4">How the payment flow works</h2>
          <div className="rounded-lg border overflow-hidden">
            <div className="divide-y">
              {[
                { step: "1", title: "Client sends request", desc: "No payment header attached." },
                { step: "2", title: "Server returns 402", desc: "Response includes price, wallet address, and network ID." },
                { step: "3", title: "Client signs payment", desc: "x402-compatible clients sign an EIP-3009 nanopayment authorization." },
                { step: "4", title: "Client retries with payment", desc: "Signed payment sent in payment-signature header." },
                { step: "5", title: "Server verifies & settles", desc: "Circle Gateway verifies the signature and batches the payment." },
                { step: "6", title: "Response served", desc: "Client receives the API response." },
              ].map((s) => (
                <div key={s.step} className="flex gap-4 px-4 py-3">
                  <span className="text-xs font-mono font-medium text-muted-foreground bg-muted w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    {s.step}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-medium mb-4">Pricing reference</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Set any price from $0.000001 to $1,000+ per call.
          </p>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Use Case</th>
                  <th className="text-right px-4 py-3 font-medium">Suggested Price</th>
                  <th className="text-left px-4 py-3 font-medium">Example</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { use: "Lightweight read", price: "$0.0001 – $0.001", ex: "Quote, joke, status" },
                  { use: "Data retrieval", price: "$0.001 – $0.01", ex: "Weather, analytics, search" },
                  { use: "Compute-heavy", price: "$0.01 – $0.10", ex: "Image gen, ML inference" },
                  { use: "Premium content", price: "$0.10 – $1.00", ex: "Reports, datasets, media" },
                  { use: "Agent tasks", price: "$0.01 – $0.05", ex: "Multi-step AI workflows" },
                ].map((row) => (
                  <tr key={row.use} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">{row.use}</td>
                    <td className="px-4 py-3 text-right font-mono">{row.price}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.ex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-medium mb-1">AI agent integration</h2>
          <p className="text-muted-foreground text-sm mb-4">
            AI agents pay automatically via the x402 protocol.
          </p>
          <CodeBlock
            title="agent.ts"
            code={`import { GatewayClient } from "@circle-fin/x402-batching/client";

const gateway = new GatewayClient({
  chain: "arcTestnet",
  privateKey: process.env.AGENT_PRIVATE_KEY,
});

await gateway.deposit("1.00");

const result = await gateway.pay(
  "https://api.example.com/weather",
  { method: "GET" }
);

console.log(result.data);
console.log(result.amount);`}
          />
        </section>

        <div className="border-t pt-8 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Built on <span className="font-medium text-foreground">Arc</span> — Circle&apos;s stablecoin-native L1
          </p>
          <Link href="/#endpoints">
            <Button variant="outline" size="sm">
              Try the playground
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
