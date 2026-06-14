"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getRole, getShopId, getShopName, setSession } from "@/lib/session";
import { auth as firebaseAuth } from "@/lib/firebase";
import { subscribeToShop, subscribeToProducts, subscribeToOrders, type Product, type ErrandOrder } from "@/lib/firestore";
import { useNotifications, timeAgo, type AppNotification, type NotifType } from "@/hooks/use-notifications";

// ── Icon helpers ───────────────────────────────────────────────────────────

function notifStyle(type: NotifType) {
  switch (type) {
    case "order_new":            return { bg: "bg-blue-50",   stroke: "#056abf" };
    case "order_delivered":      return { bg: "bg-green-50",  stroke: "#16a34a" };
    case "order_cancelled":      return { bg: "bg-red-50",    stroke: "#dc2626" };
    case "order_driver_arrived": return { bg: "bg-purple-50", stroke: "#7c3aed" };
    case "stock_low":            return { bg: "bg-amber-50",  stroke: "#d97706" };
    case "stock_out":            return { bg: "bg-red-50",    stroke: "#dc2626" };
    case "rating_new":           return { bg: "bg-yellow-50", stroke: "#ca8a04" };
    case "payout":               return { bg: "bg-emerald-50", stroke: "#059669" };
    default:                     return { bg: "bg-slate-50",  stroke: "#475569" };
  }
}

function NotifIcon({ type }: { type: NotifType }) {
  const { stroke } = notifStyle(type);
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {type === "order_new" && (
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zm0 0h12M16 10a4 4 0 0 1-8 0" />
      )}
      {type === "order_delivered" && <polyline points="20 6 9 17 4 12" />}
      {type === "order_cancelled" && (
        <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
      )}
      {type === "order_driver_arrived" && (
        <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>
      )}
      {(type === "stock_low" || type === "stock_out") && (
        <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>
      )}
      {type === "rating_new" && (
        <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></>
      )}
      {type === "payout" && (
        <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>
      )}
    </svg>
  );
}

function notifHref(type: NotifType): string {
  switch (type) {
    case "order_new":
    case "order_delivered":
    case "order_cancelled":
    case "order_driver_arrived":
      return "/orders";
    case "stock_low":
    case "stock_out":
      return "/products";
    case "rating_new":
      return "/reviews";
    case "payout":
      return "/payout";
    default:
      return "#";
  }
}

function NotifRow({
  n,
  onClose,
  onMarkRead,
}: {
  n: AppNotification;
  onClose: () => void;
  onMarkRead: (id: string) => void;
}) {
  const { bg } = notifStyle(n.type);
  return (
    <Link
      href={notifHref(n.type)}
      onClick={() => { onMarkRead(n.id); onClose(); }}
      className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors no-underline ${!n.read ? "bg-blue-50/40" : ""}`}
    >
      <div className={`size-8 rounded-full grid place-items-center shrink-0 mt-0.5 ${bg}`}>
        <NotifIcon type={n.type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs text-slate-800 truncate ${!n.read ? "font-black" : "font-semibold"}`}>{n.title}</p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{n.subtitle}</p>
        <p className="text-xs text-slate-300 mt-0.5">{timeAgo(n.ts)}</p>
      </div>
      {!n.read && <span className="size-2 rounded-full bg-blue-500 shrink-0 mt-2" />}
    </Link>
  );
}

// ── Main header ────────────────────────────────────────────────────────────

export function MainHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const [notifOpen, setNotifOpen] = useState(false);
  const [shopName, setShopName] = useState("My Shop");
  const [shopEmail, setShopEmail] = useState("");
  const [shopCurrency, setShopCurrency] = useState<string | undefined>(undefined);
  const shopId = useRef(getShopId() ?? "");
  const role = getRole();
  const displayName = firebaseAuth.currentUser?.displayName ?? "";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allOrders, setAllOrders] = useState<ErrandOrder[]>([]);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const { notifications, unreadCount, markAllRead, markRead } = useNotifications(shopId.current, shopEmail, shopCurrency);

  // Subscribe to products + orders for search
  useEffect(() => {
    const id = shopId.current;
    if (!id) return;
    const unsubP = subscribeToProducts(id, setAllProducts);
    const unsubO = subscribeToOrders(id, (orders) => setAllOrders(orders));
    return () => { unsubP(); unsubO(); };
  }, []);

  useEffect(() => {
    setShopName(getShopName());
    const id = shopId.current;
    if (!id) return;
    const unsub = subscribeToShop(id, (shop) => {
      if (!shop) return;
      if (shop.name) { setShopName(shop.name); setSession(id, shop.name, getRole()); }
      if (shop.email) setShopEmail(shop.email);
      setShopCurrency(shop.currency || shop.currencyCode || undefined);
    });
    return () => unsub();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const hits = useCallback(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return { products: [], orders: [] };
    return {
      products: allProducts
        .filter((p) => p.name.toLowerCase().includes(q))
        .slice(0, 5),
      orders: allOrders
        .filter((o) => o.orderNumber?.toLowerCase().includes(q) || o.customerName?.toLowerCase().includes(q))
        .slice(0, 5),
    };
  }, [searchQuery, allProducts, allOrders])();

  const hasHits = hits.products.length > 0 || hits.orders.length > 0;
  const showDropdown = searchOpen && searchQuery.trim().length >= 2;

  function openNotifications() {
    setNotifOpen(true);
  }

  return (
    <>
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center justify-between gap-3 lg:gap-4">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="lg:hidden size-9 rounded-lg border border-slate-200 grid place-items-center text-slate-500 hover:bg-slate-50 transition-colors shrink-0"
          aria-label="Open menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Search */}
        <div ref={searchWrapRef} className="relative flex-1 max-w-xs">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 h-9 w-full max-w-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search anything"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
              className="bg-transparent text-sm text-slate-600 placeholder:text-slate-400 outline-none flex-1"
            />
          </div>

          {/* Results dropdown */}
          {showDropdown && (
            <div className="absolute left-0 top-11 w-80 bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-200/60 z-50 overflow-hidden">
              {!hasHits ? (
                <p className="px-4 py-5 text-xs text-slate-400 text-center">No results for &ldquo;{searchQuery}&rdquo;</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {hits.products.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">Products</p>
                      {hits.products.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setSearchOpen(false); setSearchQuery(""); router.push("/products"); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                        >
                          <div className="size-8 rounded-lg bg-slate-100 grid place-items-center shrink-0">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                            <p className="text-xs text-slate-400">Stock: {p.stock}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${p.status === "Out of Stock" ? "bg-red-50 text-red-600" : p.status === "Low Stock" ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"}`}>
                            {p.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {hits.orders.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">Orders</p>
                      {hits.orders.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => { setSearchOpen(false); setSearchQuery(""); router.push("/orders"); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                        >
                          <div className="size-8 rounded-lg bg-slate-100 grid place-items-center shrink-0">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800">{o.orderNumber || o.id.slice(0, 8).toUpperCase()}</p>
                            <p className="text-xs text-slate-400 truncate">{o.customerName || "Customer"}</p>
                          </div>
                          <span className="text-[10px] text-slate-400 capitalize shrink-0">{o.status.replace("_", " ")}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/business"
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 h-9 hover:bg-slate-50 transition-colors"
          >
            <span className="size-2 rounded-full bg-green-500 shrink-0" />
            <span className="max-w-40 truncate text-xs font-black text-slate-800">{shopName.toUpperCase()}</span>
          </Link>

          {/* Logged-in user chip */}
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 h-9 bg-slate-50">
            <div className="size-6 rounded-full bg-[#056abf] grid place-items-center shrink-0">
              <span className="text-[10px] font-black text-white">{initials}</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-xs font-black text-slate-800 truncate max-w-28">{displayName || "User"}</span>
              <span className={`text-[10px] font-bold ${role === "owner" ? "text-green-600" : role === "Manager" ? "text-blue-600" : "text-slate-400"}`}>
                {role === "owner" ? "Owner" : role}
              </span>
            </div>
          </div>

          {/* Bell */}
          <div className="relative">
            <button
              onClick={notifOpen ? () => setNotifOpen(false) : openNotifications}
              className="relative size-9 rounded-lg border border-slate-200 grid place-items-center hover:bg-slate-50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-black grid place-items-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-200/60 z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-slate-900">Notifications</p>
                    {unreadCount > 0 && (
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">{unreadCount} new</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button onClick={() => markAllRead()} className="text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors">
                        Mark all read
                      </button>
                    )}
                    <button onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                      <p className="text-xs font-semibold text-slate-400">No notifications yet</p>
                      <p className="text-xs text-slate-300 mt-1">New orders and stock alerts will appear here</p>
                    </div>
                  ) : (
                    notifications.slice(0, 5).map((n) => (
                      <NotifRow
                        key={n.id}
                        n={n}
                        onClose={() => setNotifOpen(false)}
                        onMarkRead={markRead}
                      />
                    ))
                  )}
                </div>

                <div className="border-t border-slate-100 px-4 py-2.5">
                  <Link
                    href="/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="block text-center text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    See all notifications
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {notifOpen && <div className="fixed inset-0 z-20" onClick={() => setNotifOpen(false)} />}
    </>
  );
}
