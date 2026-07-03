"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/cn";
import { storeOrderAmount, subscribeToOrders, subscribeToShop, updateOrderStatus, type ErrandOrder, type ErrandStatus } from "@/lib/firestore";
import { getShopId } from "@/lib/session";
import { fmtCurrency } from "@/lib/currency";

type OrderStatus = "New" | "Preparing" | "Ready" | "Picked Up" | "Cancelled";

type DisplayOrder = {
  firestoreId: string;
  firestoreStatus: ErrandStatus;
  id: string;
  product: string;
  customer: string;
  customerId: string;
  driverId: string | null;
  shopName: string;
  qty: number;
  storeAmountRaw: number;
  customerPaidRaw: number;
  deliveryFeeRaw: number;
  serviceFeeRaw: number;
  processingFeeRaw: number;
  taxRaw: number;
  status: OrderStatus;
  date: string;
  color: string;
  orderCode: string;
  receiverAddress: string;
  items: ErrandOrder["items"];
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  New:          "bg-purple-50 text-purple-700",
  Preparing:    "bg-amber-50 text-amber-700",
  Ready:        "bg-green-50 text-green-700",
  "Picked Up":  "bg-blue-50 text-[#056abf]",
  Cancelled:    "bg-red-50 text-red-700",
};

const TABS: { label: string; value: OrderStatus | "All" }[] = [
  { label: "All Orders",  value: "All" },
  { label: "New",         value: "New" },
  { label: "Preparing",   value: "Preparing" },
  { label: "Ready",       value: "Ready" },
  { label: "Picked Up",   value: "Picked Up" },
  { label: "Cancelled",   value: "Cancelled" },
];

const TAB_ACTIVE: Record<string, string> = {
  All:         "bg-slate-900 text-white",
  New:         "bg-purple-600 text-white",
  Preparing:   "bg-amber-500 text-white",
  Ready:       "bg-green-600 text-white",
  "Picked Up": "bg-[#056abf] text-white",
  Cancelled:   "bg-red-600 text-white",
};

const STEPS: OrderStatus[] = ["New", "Preparing", "Ready", "Picked Up"];

const STATUS_COLORS: Record<OrderStatus, string> = {
  New:         "bg-purple-100",
  Preparing:   "bg-amber-100",
  Ready:       "bg-green-100",
  "Picked Up": "bg-blue-100",
  Cancelled:   "bg-red-100",
};

function mapStatus(s: ErrandStatus): OrderStatus {
  if (s === "cancelled") return "Cancelled";
  if (s === "picked_up" || s === "delivered") return "Picked Up";
  if (s === "ready") return "Ready";
  if (s === "preparing") return "Preparing";
  // pending, accepted, driver_at_shop → store hasn't acted yet
  return "New";
}

// What Firestore status the store should set next when they click the action button.
function nextFirestoreStatus(current: ErrandStatus): ErrandStatus | null {
  if (current === "pending" || current === "accepted" || current === "driver_at_shop") return "preparing";
  if (current === "preparing") return "ready";
  return null; // no store action for ready / picked_up / delivered / cancelled
}

function actionLabel(current: ErrandStatus): string | null {
  if (current === "pending" || current === "accepted" || current === "driver_at_shop") return "Start Preparing";
  if (current === "preparing") return "Mark Ready";
  return null;
}

function fmt(n: number, currency?: string): string {
  return fmtCurrency(n, currency);
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

function toDisplay(o: ErrandOrder): DisplayOrder {
  const status = mapStatus(o.status);
  return {
    firestoreId: o.id,
    firestoreStatus: o.status,
    id: o.orderNumber || o.id.slice(0, 8).toUpperCase(),
    product: o.items.map((i) => i.name).join(", ") || "—",
    customer: o.customerName || "Unknown",
    customerId: o.customerId ?? "",
    driverId: o.driverId ?? null,
    shopName: o.shopName ?? "",
    qty: o.items.reduce((s, i) => s + (i.qty ?? 1), 0),
    storeAmountRaw: storeOrderAmount(o),
    customerPaidRaw: o.total ?? 0,
    deliveryFeeRaw: o.deliveryFee ?? 0,
    serviceFeeRaw: o.serviceCharge ?? 0,
    processingFeeRaw: o.paymentProcessingFee ?? 0,
    taxRaw: o.tax ?? 0,
    status,
    date: fmtDate(o.createdAt),
    color: STATUS_COLORS[status],
    orderCode: o.orderCode ?? "",
    receiverAddress: o.receiverAddress ?? "",
    items: o.items,
  };
}

function notifyOrderStatus(customerId: string, driverId: string | null, status: string, shopName: string) {
  fetch("/api/errand-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, driverId, status, shopName }),
  }).catch(() => {});
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<DisplayOrder[]>([]);
  const [activeTab, setActiveTab] = useState<OrderStatus | "All">("All");
  const [detailOrder, setDetailOrder] = useState<DisplayOrder | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [shopCurrency, setShopCurrency] = useState("NGN");
  const pendingActionId = useRef<string | null>(null);
  const pendingRejectId = useRef<string | null>(null);

  const playSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const shopId = getShopId();
    if (!shopId) return;
    const unsubShop = subscribeToShop(shopId, (shop) => {
      setShopCurrency(shop?.currency ?? "NGN");
    });
    const unsub = subscribeToOrders(shopId, (raw, newIds) => {
      setOrders(raw.map(toDisplay));
      if (newIds.length > 0) playSound();
    });
    return () => { unsubShop(); unsub(); };
  }, [playSound]);

  const filtered = activeTab === "All" ? orders : orders.filter((o) => o.status === activeTab);

  async function handleAction() {
    const id = pendingActionId.current;
    if (!id) return;
    const order = orders.find((o) => o.firestoreId === id);
    if (!order) return;
    const next = nextFirestoreStatus(order.firestoreStatus);
    if (!next) return;

    setUpdating(true);
    try {
      await updateOrderStatus(id, next);
      setOrders((prev) =>
        prev.map((o) =>
          o.firestoreId === id
            ? { ...o, status: mapStatus(next), firestoreStatus: next, color: STATUS_COLORS[mapStatus(next)] }
            : o
        )
      );
      notifyOrderStatus(order.customerId, order.driverId, next, order.shopName);
    } finally {
      setUpdating(false);
      setConfirmOpen(false);
      pendingActionId.current = null;
    }
  }

  async function handleReject() {
    const id = pendingRejectId.current;
    if (!id) return;
    const order = orders.find((o) => o.firestoreId === id);
    if (!order) return;

    setUpdating(true);
    try {
      await updateOrderStatus(id, "cancelled");
      setOrders((prev) =>
        prev.map((o) =>
          o.firestoreId === id
            ? { ...o, status: "Cancelled", firestoreStatus: "cancelled", color: STATUS_COLORS["Cancelled"] }
            : o
        )
      );
      notifyOrderStatus(order.customerId, order.driverId, "cancelled", order.shopName);
    } finally {
      setUpdating(false);
      setRejectOpen(false);
      pendingRejectId.current = null;
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">All Orders</h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} orders</p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setActiveTab(t.value)}
            className={cn(
              "h-8 px-4 rounded-full text-xs font-bold transition-colors",
              activeTab === t.value
                ? TAB_ACTIVE[t.value]
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm font-semibold">No orders here yet.</p>
            <p className="text-xs mt-1">Orders will appear in real time as customers place them.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3 w-12" />
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Order ID</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Product</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Qty</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Store Sale</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Status</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Date</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((o) => (
                  <tr
                    key={o.firestoreId}
                    onClick={() => setDetailOrder(o)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className={cn("size-10 rounded-lg shrink-0", o.color)} />
                    </td>
                    <td className="px-4 py-3 font-black text-slate-900 text-xs">{o.id}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 max-w-[200px] truncate">{o.product}</td>
                    <td className="px-4 py-3 text-slate-600">{o.qty}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{fmt(o.storeAmountRaw, shopCurrency)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", STATUS_STYLES[o.status])}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{o.date}</td>
                    <td className="px-4 py-3">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-black text-slate-900">Order Details</h2>
                <p className="text-xs text-slate-400 mt-0.5">{detailOrder.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setDetailOrder(null)} className="text-slate-400 hover:text-slate-600">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              {detailOrder.status !== "Cancelled" && (
                <div className="flex items-center gap-1 mb-6">
                  {STEPS.map((step, i) => {
                    const stepIndex = STEPS.indexOf(detailOrder.status as OrderStatus);
                    const active = i <= stepIndex;
                    return (
                      <div key={step} className="flex items-center gap-1 flex-1">
                        <div className="flex flex-col items-center gap-1 flex-1">
                          <div className={cn("size-7 rounded-full grid place-items-center text-xs font-black", active ? "bg-[#056abf] text-white" : "bg-slate-100 text-slate-400")}>
                            {i + 1}
                          </div>
                          <p className={cn("text-[10px] font-semibold text-center", active ? "text-[#056abf]" : "text-slate-400")}>{step}</p>
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={cn("h-0.5 flex-1 -mt-4 mx-1", active && i < stepIndex ? "bg-[#056abf]" : "bg-slate-200")} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {detailOrder.status === "Cancelled" && (
                <div className="mb-4 p-3 bg-red-50 rounded-lg">
                  <p className="text-sm font-bold text-red-600">This order was cancelled.</p>
                </div>
              )}

              {/* Verification code */}
              {detailOrder.orderCode && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-500">Verification Code</p>
                  <p className="text-2xl font-black text-[#056abf] tracking-widest">{detailOrder.orderCode}</p>
                </div>
              )}

              <div className="flex items-start gap-4 mb-5">
                <div className={cn("size-16 rounded-xl shrink-0", detailOrder.color)} />
                <div className="min-w-0">
                  <p className="font-black text-slate-900 truncate">{detailOrder.product}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{detailOrder.customer}</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">Qty: {detailOrder.qty}</p>
                  {detailOrder.receiverAddress && (
                    <p className="text-xs text-slate-400 mt-1 truncate">Deliver to: {detailOrder.receiverAddress}</p>
                  )}
                </div>
              </div>

              {detailOrder.items.length > 1 && (
                <div className="mb-4 p-3 bg-slate-50 rounded-lg space-y-1.5">
                  {detailOrder.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{item.name}</span>
                      <span className="text-slate-500">×{item.qty} — {fmt(item.total, shopCurrency)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between py-3 border-t border-slate-100">
                <p className="text-sm text-slate-500">Store items</p>
                <p className="font-black text-slate-900">{fmt(detailOrder.storeAmountRaw, shopCurrency)}</p>
              </div>
              {detailOrder.deliveryFeeRaw > 0 && (
                <div className="flex items-center justify-between py-2 border-t border-slate-100">
                  <p className="text-sm text-slate-500">Delivery fee</p>
                  <p className="font-bold text-slate-700">{fmt(detailOrder.deliveryFeeRaw, shopCurrency)}</p>
                </div>
              )}
              {(detailOrder.serviceFeeRaw + detailOrder.processingFeeRaw + detailOrder.taxRaw) > 0 && (
                <div className="flex items-center justify-between py-2 border-t border-slate-100">
                  <p className="text-sm text-slate-500">Service/processing fees</p>
                  <p className="font-bold text-slate-700">
                    {fmt(detailOrder.serviceFeeRaw + detailOrder.processingFeeRaw + detailOrder.taxRaw, shopCurrency)}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between py-3 border-t border-slate-100">
                <p className="text-sm text-slate-500">Customer paid</p>
                <p className="font-black text-slate-900">{fmt(detailOrder.customerPaidRaw, shopCurrency)}</p>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setDetailOrder(null)}
                className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              {detailOrder.firestoreStatus !== "cancelled" && detailOrder.firestoreStatus !== "delivered" && detailOrder.firestoreStatus !== "picked_up" && (
                <button
                  onClick={() => {
                    pendingRejectId.current = detailOrder.firestoreId;
                    setRejectOpen(true);
                    setDetailOrder(null);
                  }}
                  className="h-10 px-4 rounded-lg border border-red-200 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
                >
                  Reject
                </button>
              )}
              {actionLabel(detailOrder.firestoreStatus) && (
                <button
                  onClick={() => {
                    pendingActionId.current = detailOrder.firestoreId;
                    setConfirmOpen(true);
                    setDetailOrder(null);
                  }}
                  className="flex-1 h-10 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors"
                >
                  {actionLabel(detailOrder.firestoreStatus)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Confirm Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm text-center p-8">
            <div className="size-16 rounded-full bg-blue-50 grid place-items-center mx-auto mb-4">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#056abf" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-2">Confirm Update</h3>
            <p className="text-slate-500 text-sm mb-6">
              {(() => {
                const order = orders.find((o) => o.firestoreId === pendingActionId.current);
                const lbl = order ? actionLabel(order.firestoreStatus) : null;
                return lbl === "Start Preparing"
                  ? "Mark this order as being prepared."
                  : "Mark this order as ready for pickup.";
              })()}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmOpen(false); pendingActionId.current = null; }}
                className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={updating}
                className="flex-1 h-10 rounded-lg bg-[#056abf] text-white font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {updating ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirm Modal */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm text-center p-8">
            <div className="size-16 rounded-full bg-red-50 grid place-items-center mx-auto mb-4">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-2">Reject Order?</h3>
            <p className="text-slate-500 text-sm mb-6">
              This will cancel the order and notify the customer. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setRejectOpen(false); pendingRejectId.current = null; }}
                className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={handleReject}
                disabled={updating}
                className="flex-1 h-10 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {updating ? "Cancelling…" : "Reject Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
