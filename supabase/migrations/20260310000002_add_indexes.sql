-- Performance indexes for dashboard queries

-- Payment events: sort by time (dashboard default view)
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at
  ON payment_events (created_at DESC);

-- Payment events: filter by endpoint (revenue-by-endpoint breakdown)
CREATE INDEX IF NOT EXISTS idx_payment_events_endpoint
  ON payment_events (endpoint);

-- Withdrawals: filter by status (pending/confirmed/failed views)
CREATE INDEX IF NOT EXISTS idx_withdrawals_status
  ON withdrawals (status);
