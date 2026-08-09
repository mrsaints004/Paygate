/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ConnectionStatus } from "@/hooks/use-transactions";

export type Withdrawal = {
  id: string;
  created_at: string;
  amount_usdc: string;
  destination_chain: string;
  destination_address: string;
  status: "submitted" | "confirmed" | "failed";
  tx_hash: string | null;
};

export function useWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("polling");
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    if (supabase) {
      async function fetchInitial() {
        const { data, error } = await supabase!
          .from("withdrawals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) {
          console.error("Failed to fetch withdrawals:", error.message);
          setConnectionStatus("offline");
        } else {
          setWithdrawals((prev) => {
            if (prev.length === 0) return data as Withdrawal[];
            const fetched = data as Withdrawal[];
            const existingIds = new Set(fetched.map((e) => e.id));
            const realtimeOnly = prev.filter((e) => !existingIds.has(e.id));
            return [...realtimeOnly, ...fetched];
          });
        }
        setLoading(false);
      }

      const channel = supabase
        .channel("withdrawals-realtime")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "withdrawals" },
          (payload) => {
            setWithdrawals((prev) => {
              const newItem = payload.new as Withdrawal;
              if (prev.some((w) => w.id === newItem.id)) return prev;
              return [newItem, ...prev];
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "withdrawals" },
          (payload) => {
            setWithdrawals((prev) =>
              prev.map((w) =>
                w.id === (payload.new as Withdrawal).id
                  ? (payload.new as Withdrawal)
                  : w,
              ),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "withdrawals" },
          (payload) => {
            setWithdrawals((prev) =>
              prev.filter(
                (w) => w.id !== (payload.old as { id: string }).id,
              ),
            );
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnectionStatus("realtime");
            fetchInitial();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnectionStatus("offline");
          }
        });

      return () => {
        supabase.removeChannel(channel);
      };
    }

    // Fallback: poll the in-memory store API
    let active = true;

    async function poll() {
      try {
        const res = await fetch("/api/events");
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setWithdrawals(data.withdrawals ?? []);
            setConnectionStatus("polling");
          }
        } else {
          if (active) setConnectionStatus("offline");
        }
      } catch {
        if (active) setConnectionStatus("offline");
      }
      setLoading(false);
    }

    poll();
    const interval = setInterval(poll, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [supabase]);

  return { withdrawals, loading, connectionStatus };
}
