import { NextRequest, NextResponse } from "next/server";
import { withGateway } from "@/lib/x402";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit(60_000, 60);

const CITIES = [
  { city: "San Francisco", temp: 64, condition: "foggy", humidity: 78 },
  { city: "New York", temp: 82, condition: "sunny", humidity: 55 },
  { city: "London", temp: 59, condition: "cloudy", humidity: 85 },
  { city: "Tokyo", temp: 88, condition: "humid", humidity: 90 },
  { city: "Sydney", temp: 68, condition: "partly cloudy", humidity: 62 },
  { city: "Lagos", temp: 91, condition: "hot", humidity: 72 },
  { city: "Berlin", temp: 71, condition: "clear", humidity: 48 },
  { city: "Dubai", temp: 108, condition: "scorching", humidity: 35 },
];

const handler = async (req: NextRequest) => {
  const limited = limiter(req);
  if (limited) return limited;

  const data = CITIES[Math.floor(Math.random() * CITIES.length)];
  return NextResponse.json({
    ...data,
    unit: "fahrenheit",
    timestamp: new Date().toISOString(),
    source: "PayGate Weather API",
  });
};

export const GET = withGateway(handler, "$0.002", "/api/premium/weather");

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
