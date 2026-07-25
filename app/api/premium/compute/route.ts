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
import { z } from "zod";
import { withGateway } from "@/lib/x402";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit(60_000, 60);

const ComputeBody = z.object({
  text: z.string().min(1, "text is required").max(50_000, "text too long"),
});

const handler = async (req: NextRequest) => {
  const limited = limiter(req);
  if (limited) return limited;

  const raw = await req.json().catch(() => ({}));
  const parsed = ComputeBody.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { text } = parsed.data;
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter(Boolean);

  return NextResponse.json({
    summary: `Input contains ${words.length} words across ${sentences.length} sentence(s).`,
    word_count: words.length,
    sentence_count: sentences.length,
    char_count: text.length,
    timestamp: new Date().toISOString(),
  });
};

export const POST = withGateway(handler, "$0.0003", "/api/premium/compute");

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, payment-signature",
    },
  });
}
