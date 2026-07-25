/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function createClient() {
  if (!SUPABASE_URL?.startsWith("http") || !SUPABASE_KEY || SUPABASE_KEY.length < 20) {
    return null;
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
