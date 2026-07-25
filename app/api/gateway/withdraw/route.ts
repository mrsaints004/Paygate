/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  GatewayClient,
  type SupportedChainName,
  GATEWAY_DOMAINS,
} from "@circle-fin/x402-batching/client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";

const SUPPORTED_CHAIN_LABELS: Record<string, string> = {
  arcTestnet: "Arc Testnet",
  baseSepolia: "Base Sepolia",
  sepolia: "Ethereum Sepolia",
  arbitrumSepolia: "Arbitrum Sepolia",
  optimismSepolia: "Optimism Sepolia",
  avalancheFuji: "Avalanche Fuji",
  polygonAmoy: "Polygon Amoy",
};

const limiter = rateLimit(60_000, 5);

const SUPPORTED_CHAINS = Object.keys(GATEWAY_DOMAINS);

const WithdrawBody = z.object({
  amount: z
    .string()
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "amount must be a positive number"),
  destinationChain: z
    .string()
    .refine((v) => SUPPORTED_CHAINS.includes(v), "unsupported destination chain"),
  destinationAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "invalid hex address")
    .optional(),
});

let supabase: SupabaseClient | null = null;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (sbUrl.startsWith("http") && sbKey.length > 20) {
  supabase = createClient(sbUrl, sbKey);
}

export async function POST(req: NextRequest) {
  // Auth check — only authenticated admins can withdraw
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session || session.value !== "authenticated") {
    return NextResponse.json(
      { error: "Authentication required. Please log in to the dashboard first." },
      { status: 401 },
    );
  }

  const limited = limiter(req);
  if (limited) return limited;

  const privateKey = process.env.SELLER_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json(
      { error: "SELLER_PRIVATE_KEY not configured" },
      { status: 500 },
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = WithdrawBody.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { amount, destinationChain, destinationAddress } = parsed.data;

  const gateway = new GatewayClient({
    chain: "arcTestnet",
    privateKey: privateKey as `0x${string}`,
  });

  const isCrossChain = destinationChain !== "arcTestnet";

  // Pre-check: ensure the seller wallet has native tokens for gas on source chain
  try {
    const balances = await gateway.getBalances();
    if (
      !balances.wallet.formatted ||
      Number(balances.wallet.formatted) === 0
    ) {
      return NextResponse.json(
        {
          error: `Seller wallet (${gateway.address}) has no native tokens on Arc Testnet to pay for gas fees. Fund it with testnet ETH first.`,
        },
        { status: 400 },
      );
    }

    const availableUsdc = Number(balances.gateway.formattedAvailable);
    if (availableUsdc < Number(amount)) {
      return NextResponse.json(
        {
          error: `Insufficient gateway balance: ${balances.gateway.formattedAvailable} USDC available, tried to withdraw ${amount} USDC.`,
        },
        { status: 400 },
      );
    }
  } catch (balanceError) {
    console.error("Failed to check balances before withdraw:", balanceError);
  }

  // Pre-check: for cross-chain withdrawals, verify gas on the destination chain
  if (isCrossChain) {
    try {
      const destGateway = new GatewayClient({
        chain: destinationChain as SupportedChainName,
        privateKey: privateKey as `0x${string}`,
      });
      const destBalances = await destGateway.getBalances();
      if (
        !destBalances.wallet.formatted ||
        Number(destBalances.wallet.formatted) === 0
      ) {
        const chainLabel =
          SUPPORTED_CHAIN_LABELS[destinationChain] ?? destinationChain;
        return NextResponse.json(
          {
            error: `Seller wallet (${destGateway.address}) has no native tokens on ${chainLabel} to pay for the mint transaction gas fees. Fund it with testnet ETH on ${chainLabel} first.`,
          },
          { status: 400 },
        );
      }
    } catch (destBalanceError) {
      console.error(
        "Failed to check destination chain gas balance:",
        destBalanceError,
      );
    }
  }

  // Insert a pending withdrawal record (if Supabase is configured)
  let withdrawalId: string | null = null;
  if (supabase) {
    const { data: withdrawal, error: insertError } = await supabase
      .from("withdrawals")
      .insert({
        amount_usdc: amount,
        destination_chain: destinationChain,
        destination_address: destinationAddress ?? gateway.address,
        status: "submitted",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to record withdrawal:", insertError.message);
    } else {
      withdrawalId = withdrawal.id;
    }
  }

  try {
    const result = await gateway.withdraw(amount, {
      chain: destinationChain as SupportedChainName,
      recipient: destinationAddress
        ? (destinationAddress as `0x${string}`)
        : undefined,
    });

    if (supabase && withdrawalId) {
      await supabase
        .from("withdrawals")
        .update({ status: "confirmed", tx_hash: result.mintTxHash })
        .eq("id", withdrawalId);
    }

    return NextResponse.json({
      id: withdrawalId,
      txHash: result.mintTxHash,
      amount: result.formattedAmount,
      sourceChain: result.sourceChain,
      destinationChain: result.destinationChain,
      recipient: result.recipient,
      status: "confirmed",
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);

    if (supabase && withdrawalId) {
      await supabase
        .from("withdrawals")
        .update({ status: "failed" })
        .eq("id", withdrawalId);
    }

    // Translate common on-chain errors into user-friendly messages
    const chainLabel =
      SUPPORTED_CHAIN_LABELS[destinationChain] ?? destinationChain;
    let message = raw;
    if (
      raw.includes("insufficient funds for gas") ||
      raw.includes("exceeds the balance of the account") ||
      raw.includes("gas required exceeds allowance")
    ) {
      message = isCrossChain
        ? `Seller wallet (${gateway.address}) has no native tokens on ${chainLabel} to pay for the CCTP mint transaction. Fund it with testnet ETH on ${chainLabel} and retry.`
        : `Seller wallet has insufficient native tokens to pay for gas. Fund ${gateway.address} with testnet ETH and retry.`;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
