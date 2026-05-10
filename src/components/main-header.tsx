"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getShopId, getShopName, setSession } from "@/lib/session";
import { subscribeToShop } from "@/lib/firestore";

const NOTIFICATIONS = [
  { id: 1, text: "Product running low", sub: "Lard bread — 3 left", time: "2m ago", type: "warn" },
  { id: 2, text: "Product out of stock", sub: "Chocolate cake — 0 left", time: "14m ago", type: "error" },
  { id: 3, text: "Order placed", sub: "#SR-4821 — ₦24,500", time: "18m ago", type: "info" },
  { id: 4, text: "Order Cancelled", sub: "#SR-4819 — ₦18,300", time: "1h ago", type: "error" },
  { id: 5, text: "Product out of stock", sub: "Butter rolls — 0 left", time: "2h ago", type: "error" },
];

export function MainHeader() {
  const [notifOpen, setNotifOpen] = useState(false);
  const [shopName, setShopName] = useState("My Shop");

  useEffect(() => {
    setShopName(getShopName());
    const shopId = getShopId();
    if (!shopId) return;

    const unsub = subscribeToShop(shopId, (shop) => {
      if (!shop?.name) return;
      setShopName(shop.name);
      setSession(shopId, shop.name);
    });

    return () => unsub();
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4">
        {/* Search */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 h-9 w-full max-w-xs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
            <span className="size-2 rounded-full bg-red-500 shrink-0" />
            <span className="max-w-40 truncate text-xs font-black text-slate-800">{shopName.toUpperCase()}</span>
          </Link>

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative size-9 rounded-lg border border-slate-200 grid place-items-center hover:bg-slate-50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="absolute -top-1 -right-1 size-4 rounded-full bg-red-500 text-white text-[10px] font-black grid place-items-center">
                3
              </span>
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 bg-white rounded-xl border border-slate-200 shadow-lg z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-black text-slate-900">Notifications</p>
                  <button
                    onClick={() => setNotifOpen(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {NOTIFICATIONS.map((n) => (
                    <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer">
                      <div
                        className={`size-8 rounded-full grid place-items-center shrink-0 mt-0.5 ${
                          n.type === "error"
                            ? "bg-red-50"
                            : n.type === "warn"
                            ? "bg-amber-50"
                            : "bg-blue-50"
                        }`}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                          stroke={n.type === "error" ? "#dc2626" : n.type === "warn" ? "#d97706" : "#056abf"}
                          strokeWidth="2.5">
                          {n.type === "info" ? (
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.5h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.29 6.29l.82-.82a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                          ) : (
                            <>
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </>
                          )}
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800">{n.text}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{n.sub}</p>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">{n.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {notifOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setNotifOpen(false)} />
      )}
    </>
  );
}
