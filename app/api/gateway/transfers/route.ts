/**
 * On-Chain Transaction Verification
 *
 * Fetches real blockchain history from the Circle Gateway API
 * and provides verification links to ArcScan explorer.
 */

import { NextResponse } from "next/server";

const GATEWAY_API = "https://gateway-api-testnet.circle.com/v1";
const ARC_TESTNET_DOMAIN = 26;
const ARCSCAN_BASE = "https://testnet.arcscan.app";

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
    const response = await fetch(`${GATEWAY_API}/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        token: "USDC",
        sources: [{ domain: ARC_TESTNET_DOMAIN, depositor: address }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Gateway transfers API error:", response.status, text);

      // Return empty transfers with a note
      return NextResponse.json({
        transfers: [],
        seller: address,
        explorer: ARCSCAN_BASE,
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
          ? `${ARCSCAN_BASE}/tx/${tx.txHash}`
          : null,
        addressUrl: tx.from
          ? `${ARCSCAN_BASE}/address/${tx.from}`
          : null,
      }),
    );

    return NextResponse.json({
      transfers,
      count: transfers.length,
      seller: address,
      explorer: ARCSCAN_BASE,
      sellerExplorerUrl: `${ARCSCAN_BASE}/address/${address}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Transfers fetch error:", message);

    return NextResponse.json({
      transfers: [],
      seller: address,
      explorer: ARCSCAN_BASE,
      error: message,
    });
  }
}
