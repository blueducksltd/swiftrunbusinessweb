"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getShopId, getShopName, setSession } from "@/lib/session";
import { subscribeToShop } from "@/lib/firestore";
import { useNotifications, timeAgo, type AppNotification, type NotifType } from "@/hooks/use-notifications";

// ── Icon helpers ───────────────────────────────────────────────────────────

function notifStyle(type: NotifType) {
  switch (type) {
    case "order_new":       return { bg: "bg-blue-50",  stroke: "#056abf" };
    case "order_delivered": return { bg: "bg-green-50", stroke: "#16a34a" };
    case "order_cancelled": return { bg: "bg-red-50",   stroke: "#dc2626" };
    case "stock_low":       return { bg: "bg-amber-50", stroke: "#d97706" };
    case "stock_out":       return { bg: "bg-red-50",   stroke: "#dc2626" };
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
      {(type === "stock_low" || type === "stock_out") && (
        <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>
      )}
    </svg>
  );
}

function NotifRow({ n }: { n: AppNotification }) {
  const { bg } = notifStyle(n.type);
  return (
    <div className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors ${!n.read ? "bg-blue-50/40" : ""}`}>
      <div className={`size-8 rounded-full grid place-items-center shrink-0 mt-0.5 ${bg}`}>
        <NotifIcon type={n.type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs text-slate-800 truncate ${!n.read ? "font-black" : "font-bold"}`}>{n.title}</p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{n.subtitle}</p>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="text-xs text-slate-400">{timeAgo(n.ts)}</span>
        {!n.read && <span className="size-2 rounded-full bg-blue-500" />}
      </div>
    </div>
  );
}

// ── Main header ────────────────────────────────────────────────────────────

export function MainHeader() {
  const [notifOpen, setNotifOpen] = useState(false);
  const [shopName, setShopName] = useState("My Shop");
  const [shopEmail, setShopEmail] = useState("");
  const shopId = useRef(getShopId() ?? "");

  const { notifications, unreadCount, markAllRead } = useNotifications(shopId.current, shopEmail);

  useEffect(() => {
    setShopName(getShopName());
    const id = shopId.current;
    if (!id) return;

    const unsub = subscribeToShop(id, (shop) => {
      if (!shop) return;
      if (shop.name) { setShopName(shop.name); setSession(id, shop.name); }
      if (shop.email) setShopEmail(shop.email);
    });

    return () => unsub();
  }, []);

  function openNotifications() {
    setNotifOpen(true);
    markAllRead();
  }

  return (
    <>
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4">
        {/* Search */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 h-9 w-full max-w-xs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search anything"
            className="bg-transparent text-sm text-slate-600 placeholder:text-slate-400 outline-none flex-1"
          />
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
                    {notifications.length > 0 && (
                      <span className="text-xs text-slate-400">({notifications.length})</span>
                    )}
                  </div>
                  <button onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
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
                    notifications.map((n) => <NotifRow key={n.id} n={n} />)
                  )}
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
