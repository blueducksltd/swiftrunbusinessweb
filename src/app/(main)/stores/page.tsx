"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/cn";
import { fmtCurrency, fmtCurrencyCompact } from "@/lib/currency";
import { subscribeToOrders, subscribeToShop, type ErrandOrder } from "@/lib/firestore";
import { getShopId } from "@/lib/session";

function fmtTime(ts: unknown): string {
  if (!ts || typeof ts !== "object" || !("seconds" in ts)) return "—";
  const d = new Date((ts as { seconds: number }).seconds * 1000);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function fmtDate(ts: unknown): string {
  if (!ts || typeof ts !== "object" || !("seconds" in ts)) return "—";
  return new Date((ts as { seconds: number }).seconds * 1000).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function isToday(ts: unknown): boolean {
  if (!ts || typeof ts !== "object" || !("seconds" in ts)) return false;
  const d = new Date((ts as { seconds: number }).seconds * 1000);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isThisWeek(ts: unknown): boolean {
  if (!ts || typeof ts !== "object" || !("seconds" in ts)) return false;
  const d = new Date((ts as { seconds: number }).seconds * 1000);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return d >= startOfWeek;
}

function isThisMonth(ts: unknown): boolean {
  if (!ts || typeof ts !== "object" || !("seconds" in ts)) return false;
  const d = new Date((ts as { seconds: number }).seconds * 1000);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

type DateFilter = "today" | "week" | "month" | "all";
type StatusFilter = "all" | "pending" | "completed" | "cancelled";

function matchesDate(order: ErrandOrder, filter: DateFilter): boolean {
  if (filter === "all") return true;
  if (filter === "today") return isToday(order.createdAt);
  if (filter === "week") return isThisWeek(order.createdAt);
  return isThisMonth(order.createdAt);
}

function matchesStatus(order: ErrandOrder, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "completed") return order.status === "delivered" || order.status === "picked_up";
  if (filter === "cancelled") return order.status === "cancelled";
  return order.status !== "delivered" && order.status !== "picked_up" && order.status !== "cancelled";
}

// ── page ──────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const [orders, setOrders] = useState<ErrandOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [commissionPct, setCommissionPct] = useState(0);
  const [shopCurrency, setShopCurrency] = useState<string | undefined>(undefined);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    const shopId = getShopId();
    if (!shopId) { setLoading(false); return; }
    const unsubOrders = subscribeToOrders(shopId, (raw) => {
      setOrders(raw);
      setLoading(false);
    });
    const unsubShop = subscribeToShop(shopId, (shop) => {
      setCommissionPct(shop?.serviceChargePct ?? 0);
      setShopCurrency(shop?.currency || shop?.currencyCode || undefined);
    });
    return () => { unsubOrders(); unsubShop(); };
  }, []);

  const filtered = useMemo(() =>
    orders.filter((o) => matchesDate(o, dateFilter) && matchesStatus(o, statusFilter)),
    [orders, dateFilter, statusFilter]
  );

  const allCompleted = orders.filter((o) => o.status === "delivered" || o.status === "picked_up");

  // Order counts (always from ALL orders, not filtered — matches the design's top-level counters)
  const todayOrders  = orders.filter((o) => isToday(o.createdAt));
  const pending      = orders.filter((o) => o.status !== "delivered" && o.status !== "picked_up" && o.status !== "cancelled");
  const completed    = orders.filter((o) => o.status === "delivered" || o.status === "picked_up");
  const cancelled    = orders.filter((o) => o.status === "cancelled");

  // Revenue (from ALL completed orders)
  const grossSales   = allCompleted.reduce((s, o) => s + (o.total ?? 0), 0);
  const commission   = Math.round(grossSales * (commissionPct / 100));
  const netEarnings  = grossSales - commission;

  // Flattened sales history rows from filtered orders
  const salesRows = useMemo(() => {
    const rows: Array<{
      orderId: string;
      orderNumber: string;
      name: string;
      imageUrl: string;
      qty: number;
      amount: number;
      createdAt: unknown;
    }> = [];
    for (const order of filtered) {
      for (const item of order.items ?? []) {
        rows.push({
          orderId: order.id,
          orderNumber: order.orderNumber || order.id.slice(0, 8).toUpperCase(),
          name: item.name,
          imageUrl: item.imageUrl ?? "",
          qty: item.qty ?? 1,
          amount: item.total ?? (item.price * (item.qty ?? 1)),
          createdAt: order.createdAt,
        });
      }
    }
    return rows;
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-10 rounded-full border-4 border-[#056abf] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">All Sales</h1>
          <p className="text-sm text-slate-500 mt-0.5">{allCompleted.length.toLocaleString()} Completed</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 outline-none focus:border-[#056abf] cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Date filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 outline-none focus:border-[#056abf] cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
      </div>

      {/* Orders Count */}
      <div className="mb-2">
        <p className="text-sm font-bold text-slate-700 mb-3">Orders Count</p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-xl border border-blue-100 p-5">
            <p className="text-xs font-semibold text-blue-400 mb-2">Total Orders Today</p>
            <p className="text-4xl font-black tabular-nums text-[#056abf]">{todayOrders.length.toString().padStart(4, "0")}</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-100 p-5">
            <p className="text-xs font-semibold text-amber-400 mb-2">Pending Orders</p>
            <p className="text-4xl font-black tabular-nums text-amber-500">{pending.length.toString().padStart(4, "0")}</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-100 p-5">
            <p className="text-xs font-semibold text-green-400 mb-2">Completed Orders</p>
            <p className="text-4xl font-black tabular-nums text-green-600">{completed.length.toString().padStart(4, "0")}</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-100 p-5">
            <p className="text-xs font-semibold text-red-300 mb-2">Cancelled Orders</p>
            <p className="text-4xl font-black tabular-nums text-red-500">{cancelled.length.toString().padStart(4, "0")}</p>
          </div>
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="mb-6 mt-4">
        <p className="text-sm font-bold text-slate-700 mb-3">Revenue Breakdown</p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: "Gross Sales",         value: fmtCurrencyCompact(grossSales, shopCurrency) },
            { label: "Platform Commission", value: commissionPct > 0 ? fmtCurrencyCompact(commission, shopCurrency) : "—" },
            { label: "Net Earnings",        value: commissionPct > 0 ? fmtCurrencyCompact(netEarnings, shopCurrency) : fmtCurrencyCompact(grossSales, shopCurrency) },
            { label: "Withdrawn Amount",    value: fmtCurrency(0, shopCurrency) },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-semibold text-slate-400 mb-2">{s.label}</p>
              <p className="text-2xl font-black text-slate-900 tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sales History */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-black text-slate-900">Sales History</h2>
          <p className="text-xs text-slate-400">{salesRows.length} item{salesRows.length !== 1 ? "s" : ""}</p>
        </div>

        {salesRows.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm font-semibold">No sales yet.</p>
            <p className="text-xs mt-1">Completed orders will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-bold text-slate-500 px-5 py-3">Name</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-5 py-3">Order ID</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-5 py-3">Quantity</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-5 py-3">Amount</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-5 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesRows.map((row, i) => (
                  <tr key={`${row.orderId}-${i}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {row.imageUrl ? (
                          <img
                            src={row.imageUrl}
                            alt={row.name}
                            className="size-12 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="size-12 rounded-lg bg-slate-100 shrink-0 grid place-items-center">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </div>
                        )}
                        <span className="font-semibold text-slate-800 max-w-[160px] truncate">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{row.orderNumber}</td>
                    <td className="px-5 py-3 text-slate-600">{row.qty}</td>
                    <td className="px-5 py-3 font-bold text-slate-900">{fmtCurrency(row.amount, shopCurrency)}</td>
                    <td className="px-5 py-3 text-slate-500 tabular-nums">{fmtTime(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
