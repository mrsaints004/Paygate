/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

export type ConnectionStatus = "realtime" | "polling" | "offline";

const PAGE_SIZE = 500;

export function usePaymentEvents() {
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("polling");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    // If Supabase is configured, use realtime
    if (supabase) {
      async function fetchInitial() {
        const { data, error } = await supabase!
          .from("payment_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE);

        if (error) {
          console.error("Failed to fetch payment events:", error.message);
          setConnectionStatus("offline");
        } else {
          setEvents((prev) => {
            if (prev.length === 0) return data as PaymentEvent[];
            const fetched = data as PaymentEvent[];
            const existingIds = new Set(fetched.map((e) => e.id));
            const realtimeOnly = prev.filter((e) => !existingIds.has(e.id));
            return [...realtimeOnly, ...fetched];
          });
        }
        setLoading(false);
      }

      const channel = supabase
        .channel("payment-events-realtime")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "payment_events" },
          (payload) => {
            setEvents((prev) => {
              const newEvent = payload.new as PaymentEvent;
              if (prev.some((ev) => ev.id === newEvent.id)) return prev;
              return [newEvent, ...prev];
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "payment_events" },
          (payload) => {
            setEvents((prev) =>
              prev.map((ev) =>
                ev.id === (payload.new as PaymentEvent).id
                  ? (payload.new as PaymentEvent)
                  : ev,
              ),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "payment_events" },
          (payload) => {
            setEvents((prev) =>
              prev.filter(
                (ev) => ev.id !== (payload.old as { id: string }).id,
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

      channelRef.current = channel;

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
            setEvents(data.payments ?? []);
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
  }, []);

  return { events, loading, connectionStatus };
}
