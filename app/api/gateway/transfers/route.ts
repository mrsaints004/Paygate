/**
 * On-Chain Transaction Verification
 *
 * Fetches real blockchain history from the Circle Gateway API
 * and provides verification links to ArcScan explorer.
 */

import { NextResponse } from "next/server";
import { network } from "@/lib/config";

export async function GET() {
  const address = process.env.SELLER_ADDRESS;
  if (!address) {
    return NextResponse.json(
      { error: "SELLER_ADDRESS not configured" },
      { status: 500 },
    );
  }

  try {
    // Fetch transfer history from Gateway API
    const response = await fetch(`${network.gatewayApiUrl}/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        token: "USDC",
        sources: [{ domain: network.gatewayDomain, depositor: address }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Gateway transfers API error:", response.status, text);

      // Return empty transfers with a note
      return NextResponse.json({
        transfers: [],
        seller: address,
        explorer: network.explorerBaseUrl,
        note: "Gateway transfers API unavailable. Use /api/events for in-memory payment history.",
      });
    }

    const data = await response.json();
    const transfers = (data.transfers ?? []).map(
      (tx: {
        txHash?: string;
        amount?: string;
        from?: string;
        to?: string;
        timestamp?: string;
        status?: string;
        domain?: number;
      }) => ({
        txHash: tx.txHash ?? null,
        amount: tx.amount ?? "0",
        from: tx.from ?? "unknown",
        to: tx.to ?? "unknown",
        timestamp: tx.timestamp ?? null,
        status: tx.status ?? "unknown",
        explorerUrl: tx.txHash
          ? `${network.explorerBaseUrl}/tx/${tx.txHash}`
          : null,
        addressUrl: tx.from
          ? `${network.explorerBaseUrl}/address/${tx.from}`
          : null,
      }),
    );

    return NextResponse.json({
      transfers,
      count: transfers.length,
      seller: address,
      explorer: network.explorerBaseUrl,
      sellerExplorerUrl: `${network.explorerBaseUrl}/address/${address}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Transfers fetch error:", message);

    return NextResponse.json({
      transfers: [],
      seller: address,
      explorer: network.explorerBaseUrl,
      error: message,
    });
  }
}
