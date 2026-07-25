/**
 * In-memory payment event store.
 * Used as fallback when Supabase is not configured.
 * Events persist for the lifetime of the server process.
 */

export type PaymentEvent = {
  id: string;
  created_at: string;
  endpoint: string;
  payer: string;
  amount_usdc: string;
  network: string;
  gateway_tx: string | null;
  raw: Record<string, unknown> | null;
};

export type Withdrawal = {
  id: string;
  created_at: string;
  amount_usdc: string;
  destination_chain: string;
  destination_address: string;
  status: "submitted" | "confirmed" | "failed";
  tx_hash: string | null;
};

export interface PaymentStats {
  totalRevenue: number;
  totalPayments: number;
  uniquePayers: number;
  revenueByEndpoint: Record<string, { count: number; revenue: number }>;
}

const MAX_EVENTS = 5000;
const payments: PaymentEvent[] = [];
const withdrawals: Withdrawal[] = [];

// Pre-calculated stats (updated on every addPayment call)
let cachedStats: PaymentStats | null = null;

function invalidateStatsCache() {
  cachedStats = null;
}

export function addPayment(event: Omit<PaymentEvent, "id" | "created_at">, timestamp?: string) {
  const entry: PaymentEvent = {
    id: crypto.randomUUID(),
    created_at: timestamp ?? new Date().toISOString(),
    ...event,
  };
  payments.unshift(entry);
  if (payments.length > MAX_EVENTS) payments.pop();
  invalidateStatsCache();
  return entry;
}

export function getPayments(): PaymentEvent[] {
  return payments;
}

export function addWithdrawal(w: Omit<Withdrawal, "id" | "created_at">, timestamp?: string) {
  const entry: Withdrawal = {
    id: crypto.randomUUID(),
    created_at: timestamp ?? new Date().toISOString(),
    ...w,
  };
  withdrawals.unshift(entry);
  return entry;
}

export function getWithdrawals(): Withdrawal[] {
  return withdrawals;
}

/**
 * Returns pre-calculated stats from the in-memory store.
 * Cached to avoid O(n) computation on every dashboard render.
 */
export function getStats(): PaymentStats {
  if (cachedStats) return cachedStats;

  let totalRevenue = 0;
  const payers = new Set<string>();
  const revenueByEndpoint: Record<string, { count: number; revenue: number }> = {};

  for (const p of payments) {
    const amount = parseFloat(p.amount_usdc);
    totalRevenue += amount;
    payers.add(p.payer);

    if (!revenueByEndpoint[p.endpoint]) {
      revenueByEndpoint[p.endpoint] = { count: 0, revenue: 0 };
    }
    revenueByEndpoint[p.endpoint].count += 1;
    revenueByEndpoint[p.endpoint].revenue += amount;
  }

  cachedStats = {
    totalRevenue,
    totalPayments: payments.length,
    uniquePayers: payers.size,
    revenueByEndpoint,
  };

  return cachedStats;
}
