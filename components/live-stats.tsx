"use client";

import { useEffect, useState, useRef } from "react";
import { Activity, DollarSign, Hash, Bot } from "lucide-react";

type StatsData = {
  totalPayments: number;
  totalVolume: number;
  activeAgents: number;
};

function AnimatedNumber({ value, prefix = "", decimals = 0 }: { value: number; prefix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value === prevRef.current) return;
    const start = prevRef.current;
    const diff = value - start;
    const duration = 600;
    const startTime = Date.now();

    function tick() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    prevRef.current = value;
  }, [value]);

  return (
    <span className="font-mono font-semibold tabular-nums">
      {prefix}{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}
    </span>
  );
}

export function LiveStats() {
  const [stats, setStats] = useState<StatsData>({
    totalPayments: 0,
    totalVolume: 0,
    activeAgents: 0,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch("/api/events");
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;

        const payments = data.payments ?? [];
        const totalVolume = payments.reduce(
          (sum: number, p: { amount_usdc: string }) => sum + parseFloat(p.amount_usdc),
          0,
        );
        const uniquePayers = new Set(
          payments.map((p: { payer: string }) => p.payer),
        );

        // Count payers with multiple payments as "agents" (automated behavior)
        const payerCounts = new Map<string, number>();
        for (const p of payments) {
          payerCounts.set(p.payer, (payerCounts.get(p.payer) ?? 0) + 1);
        }
        const activeAgents = [...payerCounts.values()].filter((c) => c >= 3).length || uniquePayers.size;

        setStats({
          totalPayments: payments.length,
          totalVolume,
          activeAgents,
        });
        setLoaded(true);
      } catch {
        // ignore
      }
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (!loaded) return null;

  return (
    <div className="border-b bg-muted/20">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-center gap-6 md:gap-10 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">Live</span>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <Hash size={13} className="text-muted-foreground" />
          <AnimatedNumber value={stats.totalPayments} />
          <span className="text-muted-foreground text-xs">payments</span>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <DollarSign size={13} className="text-muted-foreground" />
          <AnimatedNumber value={stats.totalVolume} prefix="$" decimals={4} />
          <span className="text-muted-foreground text-xs">USDC volume</span>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <Bot size={13} className="text-muted-foreground" />
          <AnimatedNumber value={stats.activeAgents} />
          <span className="text-muted-foreground text-xs">payers</span>
        </div>
      </div>
    </div>
  );
}
