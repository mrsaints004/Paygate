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
import { withGateway } from "@/lib/x402";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit(60_000, 60);

const handler = async (req: NextRequest) => {
  const limited = limiter(req);
  if (limited) return limited;

  return NextResponse.json({
    quote:
      "The best way to predict the future is to invent it. — Alan Kay",
    category: "technology",
    timestamp: new Date().toISOString(),
  });
};

export const GET = withGateway(handler, "$0.001", "/api/premium/quote");

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
