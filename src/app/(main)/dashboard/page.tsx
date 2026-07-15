"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { fmtCurrency, fmtCurrencyCompact } from "@/lib/currency";
import { getOrderStats, storeOrderAmount, subscribeToOrders, subscribeToShop, type ErrandOrder } from "@/lib/firestore";
import { getRole, getShopId, getShopName } from "@/lib/session";

type LiveOrder = {
  id: string;
  customer: string;
  items: string;
  totalRaw: number;
  status: string;
  time: string;
};

const COMPLETED_ORDER_STATUSES = new Set(["delivered", "completed", "laundry_delivered"]);

function liveStatus(status: ErrandOrder["status"]): string {
  if (status === "ready" || status === "laundry_ready_for_return") return "Ready";
  if (status === "picked_up" || status === "laundry_picked_up_from_store") return "Picked up";
  return "Preparing";
}

function timeAgo(ts: unknown): string {
  if (!ts) return "just now";
  if (typeof ts === "object" && ts !== null && "seconds" in ts) {
    const secs = Math.floor(Date.now() / 1000) - (ts as { seconds: number }).seconds;
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  }
  return "—";
}

function fmt(n: number, currency?: string): string {
  return fmtCurrencyCompact(n, currency);
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, cancelled: 0, totalRevenue: 0, avgOrder: 0 });
  const [liveOrders, setLiveOrders] = useState<LiveOrder[]>([]);
  const [allOrders, setAllOrders] = useState<ErrandOrder[]>([]);
  const [shopTypeName, setShopTypeName] = useState("");
  const [shopCurrency, setShopCurrency] = useState("NGN");
  const [shopRating, setShopRating] = useState(0);
  const [shopReviewCount, setShopReviewCount] = useState(0);
  const shopName = getShopName();
  const isOwner = getRole() === "owner";

  useEffect(() => {
    const shopId = getShopId();
    if (!shopId) return;
    getOrderStats(shopId).then(setStats).catch(() => {});
    const unsubShop = subscribeToShop(shopId, (shop) => {
      setShopTypeName(shop?.shopTypeName ?? "");
      setShopCurrency(shop?.currency ?? "NGN");
      setShopRating(Number(shop?.rating ?? 0));
      setShopReviewCount(Number(shop?.totalRatings ?? 0));
    });
    const unsubOrders = subscribeToOrders(shopId, (orders) => {
      setAllOrders(orders);
      const live = orders
        .filter((o) => [
          "pending", "accepted", "driver_at_shop", "preparing", "ready",
          "laundry_picked_up_from_customer", "laundry_at_store", "laundry_processing",
          "laundry_ready_for_return", "laundry_picked_up_from_store",
        ].includes(o.status))
        .slice(0, 5)
        .map((o) => ({
          id: o.orderNumber || o.id.slice(0, 8).toUpperCase(),
          customer: o.customerName || "Customer",
          items: o.items.map((i) => i.name).join(", ") || "—",
          totalRaw: storeOrderAmount(o),
          status: liveStatus(o.status),
          time: timeAgo(o.createdAt),
        }));
      setLiveOrders(live);
    });
    return () => {
      unsubShop();
      unsubOrders();
    };
  }, []);

  // Real revenue over the last 12 months from completed orders, as bar
  // heights (px) scaled to the busiest month.
  const revenueBars = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        label: d.toLocaleString(undefined, { month: "short", year: "2-digit" }),
        total: 0,
      });
    }
    for (const o of allOrders) {
      if (!COMPLETED_ORDER_STATUSES.has(o.status)) continue;
      const created = o.createdAt?.toDate?.();
      if (!created) continue;
      const idx = (now.getFullYear() - created.getFullYear()) * 12 +
        (now.getMonth() - created.getMonth());
      if (idx >= 0 && idx < 12) buckets[11 - idx].total += storeOrderAmount(o);
    }
    const max = Math.max(1, ...buckets.map((b) => b.total));
    return buckets.map((b) => ({
      ...b,
      height: b.total > 0 ? Math.max(8, Math.round((b.total / max) * 150)) : 4,
    }));
  }, [allOrders]);

  const statCards = isOwner
    ? [
        { label: "Total orders", value: String(stats.total), delta: `${stats.pending} active` },
        { label: "Store sales", value: fmt(stats.totalRevenue, shopCurrency), delta: `${stats.completed} completed` },
        { label: "Avg order", value: fmt(stats.avgOrder, shopCurrency), delta: `${stats.cancelled} cancelled` },
        { label: "Pending", value: String(stats.pending), delta: "active now" },
      ]
    : [
        { label: "Total orders", value: String(stats.total), delta: `${stats.pending} active` },
        { label: "Pending", value: String(stats.pending), delta: "active now" },
        { label: "Completed", value: String(stats.completed), delta: "all time" },
        { label: "Cancelled", value: String(stats.cancelled), delta: "all time" },
      ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-sm font-semibold text-[#056abf]">{shopName}</p>
          <h1 className="text-2xl font-black text-slate-900">Business dashboard</h1>
          {shopTypeName && (
            <p className="mt-1 text-sm font-semibold text-slate-500">Shop type: {shopTypeName}</p>
          )}
          <p className="mt-1 text-sm font-semibold text-amber-600">
            {shopReviewCount > 0
              ? `Rating: ${shopRating.toFixed(1)} (${shopReviewCount} ${shopReviewCount === 1 ? "review" : "reviews"})`
              : "No ratings yet"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
            Export
          </button>
          <a href="/products" className="h-10 rounded-lg bg-[#056abf] px-4 text-sm font-bold text-white hover:bg-blue-700 transition-colors flex items-center">
            Add product
          </a>
        </div>
      </div>

      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </section>

        <section className={isOwner ? "grid gap-6 xl:grid-cols-[1.45fr_0.9fr]" : ""}>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black">Live orders</h2>
                <p className="text-sm text-slate-500">Realtime order flow preview</p>
              </div>
              <a href="/orders" className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 transition-colors">
                View all
              </a>
            </div>
            <div className="mt-5 overflow-hidden rounded-lg border border-slate-100">
              {liveOrders.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">No active orders right now.</div>
              ) : (
                liveOrders.map((order) => (
                  <OrderRow key={order.id} {...order} currency={shopCurrency} />
                ))
              )}
            </div>
          </div>

          {isOwner && (
            <div className="rounded-xl border border-slate-200 bg-[#071a2f] p-5 text-white">
              <p className="text-sm font-semibold text-blue-200">Store sales</p>
              <p className="mt-3 text-4xl font-black tabular-nums">{fmt(stats.totalRevenue, shopCurrency)}</p>
              <div className="mt-6 flex h-40 items-end gap-2">
                {revenueBars.map((bar, index) => (
                  <div
                    key={index}
                    className="flex-1 rounded-t bg-blue-400"
                    style={{ height: bar.height }}
                    title={`${bar.label}: ${fmt(bar.total, shopCurrency)}`}
                  />
                ))}
              </div>
              <div className="mt-1 flex gap-2 text-[9px] text-blue-300">
                {revenueBars.map((bar, index) => (
                  <span key={index} className="flex-1 text-center">
                    {bar.label.split(" ")[0]}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm text-blue-100">{stats.completed} completed · {stats.cancelled} cancelled</p>
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          {isOwner && (
            <Panel title="Order summary" subtitle="All time stats">
              <div className="space-y-3">
                {[
                  { name: "Total orders", value: String(stats.total) },
                  { name: "Completed", value: String(stats.completed) },
                  { name: "Cancelled", value: String(stats.cancelled) },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                    <p className="font-bold">{item.name}</p>
                    <p className="font-black tabular-nums text-[#056abf]">{item.value}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Delivery queue" subtitle="Active SwiftRun riders">
            <div className="space-y-3">
              {liveOrders.slice(0, 3).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No active deliveries.</p>
              ) : (
                liveOrders.slice(0, 3).map((o) => (
                  <div key={o.id} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-bold">{o.id}</p>
                      <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-black text-green-700">
                        {o.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 truncate">{o.customer}</p>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Store actions" subtitle="Common business tasks">
            <div className="grid gap-3">
              {[
                { label: "Add product", href: "/products" },
                { label: "View all orders", href: "/orders" },
                { label: "View reviews", href: "/reviews" },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  className="h-12 rounded-lg border border-slate-200 px-4 flex items-center text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </Panel>
        </section>
      </div>
    </>
  );
}

function StatCard({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-3xl font-black">{value}</p>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#056abf]">{delta}</span>
      </div>
    </article>
  );
}

function OrderRow({ id, customer, items, totalRaw, currency, status, time }: {
  id: string; customer: string; items: string; totalRaw: number; currency: string; status: string; time: string;
}) {
  const statusColor = status === "Ready" ? "bg-green-50 text-green-700" : status === "Picked up" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";
  return (
    <div className={cn("grid gap-3 border-b border-slate-100 p-4 last:border-b-0", "md:grid-cols-[0.8fr_1fr_1.4fr_0.8fr_0.8fr] md:items-center")}>
      <p className="font-black text-slate-900">{id}</p>
      <p className="font-semibold">{customer}</p>
      <p className="text-sm text-slate-500 truncate">{items}</p>
      <p className="font-black">{fmt(totalRaw, currency)}</p>
      <div className="flex items-center justify-between gap-3 md:block">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", statusColor)}>{status}</span>
        <p className="mt-1 text-xs text-slate-400">{time}</p>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
