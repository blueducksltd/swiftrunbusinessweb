"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { subscribeToOrders, type ErrandOrder } from "@/lib/firestore";
import { getShopId } from "@/lib/session";

function fmt(n: number) {
  return `₦${n.toLocaleString("en-NG")}`;
}

function fmtDate(ts: unknown): string {
  if (!ts) return "—";
  if (typeof ts === "object" && ts !== null && "seconds" in ts) {
    return new Date((ts as { seconds: number }).seconds * 1000).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  }
  return "—";
}

function mapDisplayStatus(status: string): { label: string; style: string } {
  if (status === "delivered" || status === "picked_up") return { label: "Completed", style: "bg-green-50 text-green-700" };
  if (status === "cancelled") return { label: "Cancelled", style: "bg-red-50 text-red-700" };
  return { label: "Pending", style: "bg-amber-50 text-amber-700" };
}

export default function StoresPage() {
  const [orders, setOrders] = useState<ErrandOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const shopId = getShopId();
    if (!shopId) { setLoading(false); return; }
    const unsub = subscribeToOrders(shopId, (raw) => {
      setOrders(raw);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const completed = orders.filter((o) => o.status === "delivered" || o.status === "picked_up");
  const pending   = orders.filter((o) => o.status !== "delivered" && o.status !== "picked_up" && o.status !== "cancelled");
  const cancelled = orders.filter((o) => o.status === "cancelled");
  const totalRevenue = completed.reduce((s, o) => s + (o.total ?? 0), 0);
  const avgOrder = completed.length > 0 ? Math.round(totalRevenue / completed.length) : 0;

  const now = new Date();
  const thisMonthRevenue = completed
    .filter((o) => {
      const ts = o.createdAt as unknown as { seconds: number } | null;
      if (!ts) return false;
      const d = new Date(ts.seconds * 1000);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, o) => s + (o.total ?? 0), 0);

  const todayRevenue = completed
    .filter((o) => {
      const ts = o.createdAt as unknown as { seconds: number } | null;
      if (!ts) return false;
      const d = new Date(ts.seconds * 1000);
      return d.toDateString() === now.toDateString();
    })
    .reduce((s, o) => s + (o.total ?? 0), 0);

  const topStats = [
    { label: "Total Orders",  value: orders.length,     color: "text-slate-900" },
    { label: "Completed",     value: completed.length,  color: "text-green-600" },
    { label: "Pending",       value: pending.length,    color: "text-[#056abf]" },
    { label: "Cancelled",     value: cancelled.length,  color: "text-red-500"  },
  ];

  const revenueStats = [
    { label: "Total Revenue",    value: fmt(totalRevenue),       sub: "All time" },
    { label: "Avg Order Value",  value: fmt(avgOrder),           sub: "Per completed order" },
    { label: "This Month",       value: fmt(thisMonthRevenue),   sub: now.toLocaleString("default", { month: "long", year: "numeric" }) },
    { label: "Today",            value: fmt(todayRevenue),       sub: now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-4 border-[#056abf] border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-slate-500">Loading store data…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">Store Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">Sales summary and order history</p>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {topStats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-500 mb-2">{s.label}</p>
            <p className={`text-4xl font-black tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {revenueStats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-500 mb-1">{s.label}</p>
            <p className="text-2xl font-black text-slate-900 tabular-nums">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Order history */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-black text-slate-900">Order History</h2>
        </div>
        {orders.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm font-semibold">No orders yet.</p>
            <p className="text-xs mt-1">Your completed orders will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Order ID</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Items</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Customer</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Total</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Status</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => {
                  const { label, style } = mapDisplayStatus(o.status);
                  const itemSummary = o.items?.map((i) => i.name).join(", ") || "—";
                  return (
                    <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-black text-xs text-slate-900">
                        {o.orderNumber || o.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800 max-w-[200px] truncate">{itemSummary}</td>
                      <td className="px-4 py-3 text-slate-600">{o.customerName || "—"}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{fmt(o.total ?? 0)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", style)}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{fmtDate(o.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
