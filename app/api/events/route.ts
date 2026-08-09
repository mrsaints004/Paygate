import { NextResponse } from "next/server";
import { getPayments, getWithdrawals } from "@/lib/payment-store";
import { seedDemoData } from "@/lib/seed-demo-data";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET() {
  seedDemoData();

  return NextResponse.json(
    { payments: getPayments(), withdrawals: getWithdrawals() },
    { headers: CORS_HEADERS },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
