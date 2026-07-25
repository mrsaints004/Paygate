import { NextResponse } from "next/server";
import { getPayments, getWithdrawals } from "@/lib/payment-store";
import { seedDemoData } from "@/lib/seed-demo-data";

export async function GET() {
  seedDemoData();

  return NextResponse.json({
    payments: getPayments(),
    withdrawals: getWithdrawals(),
  });
}
