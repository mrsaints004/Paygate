import { NextResponse } from "next/server";

/**
 * Agent Discovery Endpoint
 *
 * Returns all paywalled endpoints with pricing, enabling AI agents to
 * autonomously discover what's available and make cost/value decisions.
 */

const ENDPOINTS = [
  {
    endpoint: "/api/premium/quote",
    method: "GET",
    price: "$0.001",
    price_usdc: 0.001,
    description: "Random technology or programming quote. Returns quote text and author.",
  },
  {
    endpoint: "/api/premium/weather",
    method: "GET",
    price: "$0.002",
    price_usdc: 0.002,
    description: "Weather data for a random city. Returns temperature, condition, humidity.",
  },
  {
    endpoint: "/api/premium/compute",
    method: "POST",
    price: "$0.0003",
    price_usdc: 0.0003,
    description: "Text analysis — word count, sentence count, character count. Send JSON body with 'text' field.",
  },
  {
    endpoint: "/api/premium/dataset",
    method: "GET",
    price: "$0.01",
    price_usdc: 0.01,
    description: "Sample analytics dataset with user metrics, page views, and conversion data.",
  },
  {
    endpoint: "/api/premium/joke",
    method: "GET",
    price: "$0.0005",
    price_usdc: 0.0005,
    description: "Programming or crypto joke. Returns setup and punchline.",
  },
  {
    endpoint: "/api/premium/agent-task",
    method: "GET",
    price: "$0.03",
    price_usdc: 0.03,
    description: "Treasure hunt clue for autonomous agents. High-value task requiring multi-step reasoning.",
  },
];

export async function GET() {
  return NextResponse.json({
    protocol: "x402",
    version: 2,
    network: "eip155:5042002",
    chain: "Arc Testnet",
    settlement: "Circle Gateway (batched nanopayments)",
    endpoints: ENDPOINTS,
    instructions: {
      step1: "GET the endpoint — receive 402 with PAYMENT-REQUIRED header (base64 JSON)",
      step2: "Decode header to get payment requirements (amount, payTo, asset, network)",
      step3: "Sign EIP-3009 nanopayment authorization",
      step4: "Retry request with payment-signature header (base64 payment payload)",
      step5: "Receive 200 response with data + PAYMENT-RESPONSE header",
    },
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "public, max-age=60",
    },
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
