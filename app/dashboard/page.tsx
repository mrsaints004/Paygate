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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  Hash,
  Loader2,
  Users,
  TrendingUp,
  Activity,
} from "lucide-react";
import { shortenHash } from "@/lib/utils";
import { usePaymentEvents } from "@/hooks/use-transactions";
import { useWithdrawals } from "@/hooks/use-withdrawals";
import { PROTOCOL_FEE_RATE, network } from "@/lib/config";

function RevenueChart({ events }: { events: { amount_usdc: string; created_at: string }[] }) {
  const buckets = useMemo(() => {
    if (events.length === 0) return [];

    // Group revenue into hourly buckets
    const map = new Map<string, number>();
    for (const ev of events) {
      const d = new Date(ev.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`;
      map.set(key, (map.get(key) ?? 0) + parseFloat(ev.amount_usdc));
    }

    // Sort by time, keep last 24 buckets
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([label, value]) => ({ label, value }));
  }, [events]);

  if (buckets.length < 2) return null;

  const maxVal = Math.max(...buckets.map((b) => b.value), 0.000001);
  const chartW = 100;
  const chartH = 40;
  const barW = chartW / buckets.length;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-muted-foreground mb-3">Revenue over time</h2>
      <div className="rounded-lg border px-4 py-4">
        <svg viewBox={`0 0 ${chartW} ${chartH + 8}`} className="w-full h-32" preserveAspectRatio="none">
          {buckets.map((b, i) => {
            const barH = (b.value / maxVal) * chartH;
            return (
              <g key={b.label}>
                <rect
                  x={i * barW + barW * 0.15}
                  y={chartH - barH}
                  width={barW * 0.7}
                  height={barH}
                  className="fill-primary/70"
                  rx={0.5}
                />
              </g>
            );
          })}
          <line x1={0} y1={chartH} x2={chartW} y2={chartH} className="stroke-border" strokeWidth={0.2} />
        </svg>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-muted-foreground font-mono">{buckets[0].label.slice(5)}</span>
          <span className="text-[10px] text-muted-foreground font-mono">{buckets[buckets.length - 1].label.slice(5)}</span>
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[10px] text-muted-foreground">Hourly buckets (last 24)</span>
          <span className="text-[10px] text-muted-foreground font-mono">max: ${maxVal.toFixed(6)}</span>
        </div>
      </div>
    </div>
  );
}

function LiveFeed({ events }: { events: { endpoint: string; amount_usdc: string; payer: string; created_at: string }[] }) {
  const recent = events.slice(0, 5);
  const prevCountRef = useRef(events.length);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (events.length > prevCountRef.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      prevCountRef.current = events.length;
      return () => clearTimeout(t);
    }
    prevCountRef.current = events.length;
  }, [events.length]);

  if (recent.length === 0) return null;

  return (
    <div className={`rounded-lg border px-4 py-3 mb-6 transition-colors ${flash ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <Activity size={14} className="text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Live Activity</span>
      </div>
      <div className="space-y-1">
        {recent.map((ev, i) => (
          <div
            key={`${ev.created_at}-${i}`}
            className={`text-xs font-mono flex items-center gap-2 ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}
          >
            <span className="text-primary font-semibold">${ev.amount_usdc}</span>
            <span className="text-muted-foreground">from</span>
            <span>{ev.payer.slice(0, 6)}...{ev.payer.slice(-4)}</span>
            <span className="text-muted-foreground">for</span>
            <code className="bg-muted px-1 py-0.5 rounded text-xs">{ev.endpoint}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

type SortDirection = "default" | "asc" | "desc";
type SortField = "amount" | "date";

const EXPLORER_BASE = network.explorerBaseUrl;

function nextSortDirection(current: SortDirection): SortDirection {
  if (current === "default") return "asc";
  if (current === "asc") return "desc";
  return "default";
}

function SortIcon({ direction }: { direction: SortDirection }) {
  if (direction === "asc") return <ArrowUp size={14} />;
  if (direction === "desc") return <ArrowDown size={14} />;
  return <ArrowUpDown size={14} className="text-muted-foreground/50" />;
}

function parseAmount(amount: string): number {
  return parseFloat(amount.replace(/,/g, ""));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CopyableCell({
  value,
  label,
  href,
}: {
  value: string;
  label?: string;
  href?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <span className="inline-flex items-center gap-1.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline text-primary"
        >
          {label ?? value}
        </a>
      ) : (
        <span>{label ?? value}</span>
      )}
      <Tooltip open={copied ? true : undefined}>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            <Copy size={12} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copied!" : "Copy"}</TooltipContent>
      </Tooltip>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "confirmed"
      ? "default"
      : status === "failed"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function ConnectionIndicator({ status }: { status: "realtime" | "polling" | "offline" }) {
  const color =
    status === "realtime"
      ? "bg-green-500"
      : status === "polling"
        ? "bg-yellow-500"
        : "bg-red-500";
  const label =
    status === "realtime" ? "Realtime" : status === "polling" ? "Polling" : "Offline";

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`w-1.5 h-1.5 rounded-full ${color} ${status === "realtime" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

export default function Dashboard() {
  const { events, loading: loadingPayments, connectionStatus } = usePaymentEvents();
  const { withdrawals, loading: loadingWithdrawals } = useWithdrawals();
  const [activeTab, setActiveTab] = useState("payments");
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("default");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  function handleSort(field: SortField) {
    if (sortField === field) {
      const next = nextSortDirection(sortDirection);
      setSortDirection(next);
      if (next === "default") setSortField(null);
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setPage(1);
  }

  const filteredPayments = useMemo(() => {
    let result = events;

    if (filter) {
      const query = filter.toLowerCase();
      result = result.filter(
        (ev) =>
          (ev.gateway_tx ?? "").toLowerCase().includes(query) ||
          ev.payer.toLowerCase().includes(query) ||
          ev.endpoint.toLowerCase().includes(query),
      );
    }

    if (sortField && sortDirection !== "default") {
      result = [...result].sort((a, b) => {
        let cmp: number;
        if (sortField === "amount") {
          cmp = parseAmount(a.amount_usdc) - parseAmount(b.amount_usdc);
        } else {
          cmp = a.created_at.localeCompare(b.created_at);
        }
        return sortDirection === "desc" ? -cmp : cmp;
      });
    }

    return result;
  }, [events, filter, sortField, sortDirection]);

  const filteredWithdrawals = useMemo(() => {
    let result = withdrawals;

    if (filter) {
      const query = filter.toLowerCase();
      result = result.filter(
        (w) =>
          (w.tx_hash ?? "").toLowerCase().includes(query) ||
          w.destination_address.toLowerCase().includes(query) ||
          w.destination_chain.toLowerCase().includes(query) ||
          w.status.toLowerCase().includes(query),
      );
    }

    if (sortField && sortDirection !== "default") {
      result = [...result].sort((a, b) => {
        let cmp: number;
        if (sortField === "amount") {
          cmp = parseAmount(a.amount_usdc) - parseAmount(b.amount_usdc);
        } else {
          cmp = a.created_at.localeCompare(b.created_at);
        }
        return sortDirection === "desc" ? -cmp : cmp;
      });
    }

    return result;
  }, [withdrawals, filter, sortField, sortDirection]);

  const activeData = activeTab === "payments" ? filteredPayments : filteredWithdrawals;
  const loading = activeTab === "payments" ? loadingPayments : loadingWithdrawals;
  const totalPages = Math.max(1, Math.ceil(activeData.length / pageSize));
  const clampedPage = Math.min(page, totalPages);

  const paginatedPayments = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return filteredPayments.slice(start, start + pageSize);
  }, [filteredPayments, clampedPage, pageSize]);

  const paginatedWithdrawals = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return filteredWithdrawals.slice(start, start + pageSize);
  }, [filteredWithdrawals, clampedPage, pageSize]);

  const stats = useMemo(() => {
    let grossRevenue = 0;
    let totalFees = 0;
    const payers = new Set<string>();
    const byEndpoint: Record<string, { count: number; revenue: number }> = {};

    for (const ev of events) {
      const amount = parseAmount(ev.amount_usdc);
      if (ev.endpoint === "protocol-fee") {
        totalFees += amount;
        continue;
      }
      grossRevenue += amount;
      payers.add(ev.payer);
      if (!byEndpoint[ev.endpoint]) byEndpoint[ev.endpoint] = { count: 0, revenue: 0 };
      byEndpoint[ev.endpoint].count += 1;
      byEndpoint[ev.endpoint].revenue += amount;
    }

    const nonFeeEvents = events.filter((ev) => ev.endpoint !== "protocol-fee");
    const avgPayment = nonFeeEvents.length > 0 ? grossRevenue / nonFeeEvents.length : 0;
    const netRevenue = grossRevenue - totalFees;

    return {
      grossRevenue,
      netRevenue,
      totalFees,
      feeRate: PROTOCOL_FEE_RATE,
      uniquePayers: payers.size,
      avgPayment,
      paymentCount: nonFeeEvents.length,
      byEndpoint,
    };
  }, [events]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Monitor incoming nanopayments and manage withdrawals.
          </p>
        </div>
        <ConnectionIndicator status={connectionStatus} />
      </div>

      <LiveFeed events={events} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { icon: DollarSign, label: "Net Revenue", value: `$${stats.netRevenue.toFixed(6)}` },
          { icon: Hash, label: "Total Payments", value: String(stats.paymentCount) },
          { icon: Users, label: "Unique Payers", value: String(stats.uniquePayers) },
          { icon: TrendingUp, label: "Avg Payment", value: `$${stats.avgPayment.toFixed(6)}` },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border px-4 py-4">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <s.icon size={13} />
              <span className="text-xs">{s.label}</span>
            </div>
            <p className="text-xl font-semibold font-mono">{s.value}</p>
          </div>
        ))}
      </div>

      {stats.grossRevenue > 0 && (
        <div className="mb-6 rounded-lg border px-4 py-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Revenue Breakdown</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Gross Revenue</p>
              <p className="text-lg font-semibold font-mono">${stats.grossRevenue.toFixed(6)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Protocol Fees ({(stats.feeRate * 100).toFixed(0)}%)</p>
              <p className="text-lg font-semibold font-mono text-orange-500">&minus;${stats.totalFees.toFixed(6)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net Revenue</p>
              <p className="text-lg font-semibold font-mono text-green-500">${stats.netRevenue.toFixed(6)}</p>
            </div>
          </div>
        </div>
      )}

      <RevenueChart events={events} />

      {Object.keys(stats.byEndpoint).length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Revenue by endpoint</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(stats.byEndpoint)
              .sort(([, a], [, b]) => b.revenue - a.revenue)
              .map(([endpoint, data]) => (
                <div
                  key={endpoint}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{endpoint}</code>
                    <p className="text-xs text-muted-foreground mt-1">{data.count} calls</p>
                  </div>
                  <span className="font-mono text-sm font-medium">${data.revenue.toFixed(6)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <Input
          placeholder={
            activeTab === "payments"
              ? "Filter by tx hash, payer, or endpoint..."
              : "Filter by tx hash, address, chain, or status..."
          }
          className="max-w-xs"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(1); }}
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Rows</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
          >
            <SelectTrigger size="sm" className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v);
          setFilter("");
          setPage(1);
          setSortField(null);
          setSortDirection("default");
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="text-right">
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
                      onClick={() => handleSort("amount")}
                    >
                      Amount (USDC)
                      <SortIcon
                        direction={sortField === "amount" ? sortDirection : "default"}
                      />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={() => handleSort("date")}
                    >
                      Date
                      <SortIcon direction={sortField === "date" ? sortDirection : "default"} />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPayments ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      <Loader2 size={16} className="animate-spin inline mr-2" />
                      Loading payments...
                    </TableCell>
                  </TableRow>
                ) : paginatedPayments.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No payments found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPayments.map((ev) => (
                    <TableRow key={ev.id} className="hover:bg-muted/50">
                      <TableCell className="font-mono text-xs">
                        {ev.gateway_tx ? (
                          <CopyableCell
                            value={ev.gateway_tx}
                            label={shortenHash(ev.gateway_tx, 6)}
                            href={
                              ev.gateway_tx.startsWith("0x")
                                ? `${EXPLORER_BASE}/tx/${ev.gateway_tx}`
                                : undefined
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <CopyableCell
                          value={ev.payer}
                          label={shortenHash(ev.payer)}
                          href={`${EXPLORER_BASE}/address/${ev.payer}`}
                        />
                      </TableCell>
                      <TableCell className="text-xs">
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                          {ev.endpoint}
                        </code>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${ev.amount_usdc}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(ev.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="withdrawals">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
                      onClick={() => handleSort("amount")}
                    >
                      Amount (USDC)
                      <SortIcon
                        direction={sortField === "amount" ? sortDirection : "default"}
                      />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={() => handleSort("date")}
                    >
                      Date
                      <SortIcon direction={sortField === "date" ? sortDirection : "default"} />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingWithdrawals ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      <Loader2 size={16} className="animate-spin inline mr-2" />
                      Loading withdrawals...
                    </TableCell>
                  </TableRow>
                ) : paginatedWithdrawals.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No withdrawals found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedWithdrawals.map((w) => (
                    <TableRow key={w.id} className="hover:bg-muted/50">
                      <TableCell className="font-mono text-xs">
                        {w.tx_hash ? (
                          <CopyableCell
                            value={w.tx_hash}
                            label={shortenHash(w.tx_hash, 6)}
                            href={
                              w.tx_hash.startsWith("0x")
                                ? `${EXPLORER_BASE}/tx/${w.tx_hash}`
                                : undefined
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <CopyableCell
                          value={w.destination_address}
                          label={shortenHash(w.destination_address)}
                          href={`${EXPLORER_BASE}/address/${w.destination_address}`}
                        />
                      </TableCell>
                      <TableCell className="text-xs">
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                          {w.destination_chain}
                        </code>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={w.status} />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${w.amount_usdc}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(w.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {!loading && activeData.length > 0 && (
        <div className="flex items-center justify-between border-x border-b rounded-b-lg px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {activeData.length} {activeTab === "payments" ? "transaction" : "withdrawal"}{activeData.length !== 1 ? "s" : ""} total
          </span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              Page {clampedPage} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage <= 1}
              className="inline-flex items-center justify-center rounded-md border h-8 w-8 disabled:opacity-30 hover:bg-muted transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={clampedPage >= totalPages}
              className="inline-flex items-center justify-center rounded-md border h-8 w-8 disabled:opacity-30 hover:bg-muted transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
