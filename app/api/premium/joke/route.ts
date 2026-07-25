import { NextRequest, NextResponse } from "next/server";
import { withGateway } from "@/lib/x402";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit(60_000, 60);

const JOKES = [
  { setup: "Why do programmers prefer dark mode?", punchline: "Because light attracts bugs." },
  { setup: "Why was the blockchain developer so calm?", punchline: "Because they had proof of stake." },
  { setup: "What's a stablecoin's favorite music?", punchline: "Anything without too much volatility." },
  { setup: "Why did the API go to therapy?", punchline: "It had too many unresolved requests." },
  { setup: "What did the payment say to the API?", punchline: "402 — I require your attention." },
  { setup: "Why don't micropayments ever get lonely?", punchline: "They always come in batches." },
  { setup: "What's an AI agent's least favorite HTTP status?", punchline: "402 — it costs money." },
  { setup: "Why did the developer use nanopayments?", punchline: "Because Stripe charged more than the product." },
];

const handler = async (req: NextRequest) => {
  const limited = limiter(req);
  if (limited) return limited;

  const joke = JOKES[Math.floor(Math.random() * JOKES.length)];
  return NextResponse.json({
    ...joke,
    timestamp: new Date().toISOString(),
    source: "PayGate Joke API",
  });
};

export const GET = withGateway(handler, "$0.0005", "/api/premium/joke");

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, payment-signature",
    },
  });
}
