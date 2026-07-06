"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  deleteDoc,
  updateDoc,
  writeBatch,
  doc,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getShopId } from "@/lib/session";
import { timeAgo, type NotifType } from "@/hooks/use-notifications";

// ── Types ──────────────────────────────────────────────────────────────────

interface Notif {
  id: string;
  type: NotifType;
  title: string;
  subtitle: string;
  ts: number;
  read: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function notifHref(type: NotifType): string {
  if (type === "payout") return "/payout";
  if (type === "order_new" || type.startsWith("order_")) return "/orders";
  if (type === "stock_low" || type === "stock_out") return "/products";
  if (type === "rating_new") return "/reviews";
  return "#";
}

function typeLabel(type: NotifType): string {
  switch (type) {
    case "order_new": return "New Order";
    case "order_delivered": return "Delivered";
    case "order_cancelled": return "Cancelled";
    case "order_driver_arrived": return "Driver Arrived";
    case "stock_low": return "Low Stock";
    case "stock_out": return "Out of Stock";
    case "rating_new": return "Review";
    case "payout": return "Payout";
    default: return "Update";
  }
}

function typeColors(type: NotifType) {
  switch (type) {
    case "order_new": return { bg: "bg-blue-50", text: "text-[#056abf]", badge: "bg-blue-100 text-blue-700" };
    case "order_delivered": return { bg: "bg-green-50", text: "text-green-600", badge: "bg-green-100 text-green-700" };
    case "order_cancelled": return { bg: "bg-red-50", text: "text-red-600", badge: "bg-red-100 text-red-700" };
    case "order_driver_arrived": return { bg: "bg-purple-50", text: "text-purple-600", badge: "bg-purple-100 text-purple-700" };
    case "stock_low": return { bg: "bg-amber-50", text: "text-amber-600", badge: "bg-amber-100 text-amber-700" };
    case "stock_out": return { bg: "bg-red-50", text: "text-red-600", badge: "bg-red-100 text-red-700" };
    case "rating_new": return { bg: "bg-yellow-50", text: "text-yellow-600", badge: "bg-yellow-100 text-yellow-700" };
    case "payout": return { bg: "bg-emerald-50", text: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700" };
    default: return { bg: "bg-slate-50", text: "text-slate-600", badge: "bg-slate-100 text-slate-700" };
  }
}

function TypeIcon({ type }: { type: NotifType }) {
  const { text } = typeColors(type);
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className={text} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {(type === "order_new") && <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zm0 0h12M16 10a4 4 0 0 1-8 0" />}
      {(type === "order_delivered") && <polyline points="20 6 9 17 4 12" />}
      {(type === "order_cancelled") && <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>}
      {(type === "order_driver_arrived") && <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>}
      {(type === "stock_low" || type === "stock_out") && <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>}
      {(type === "rating_new") && <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />}
      {(type === "payout") && <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>}
    </svg>
  );
}

const PAGE_SIZE = 25;

// ── Page ───────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shopId = getShopId() ?? "";

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadPage = useCallback(
    async (after: QueryDocumentSnapshot | null = null) => {
      if (!shopId) return;
      const q = after
        ? query(collection(db, "Shops", shopId, "notifications"), orderBy("ts", "desc"), startAfter(after), limit(PAGE_SIZE))
        : query(collection(db, "Shops", shopId, "notifications"), orderBy("ts", "desc"), limit(PAGE_SIZE));

      const snap = await getDocs(q);
      const items: Notif[] = snap.docs.map((d) => ({
        id: d.id,
        type: d.data().type as NotifType,
        title: d.data().title as string,
        subtitle: d.data().subtitle as string,
        ts: d.data().ts as number,
        read: (d.data().read as boolean) ?? false,
      }));

      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
      return items;
    },
    [shopId]
  );

  useEffect(() => {
    if (!shopId) return;
    setLoading(true);
    loadPage(null)
      .then((items) => { setNotifs(items ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [shopId, loadPage]);

  async function loadMore() {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    const items = await loadPage(lastDoc).catch(() => []);
    setNotifs((prev) => [...prev, ...(items ?? [])]);
    setLoadingMore(false);
  }

  async function markRead(id: string) {
    await updateDoc(doc(db, "Shops", shopId, "notifications", id), { read: true }).catch(() => {});
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    const unread = notifs.filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(doc(db, "Shops", shopId, "notifications", n.id), { read: true }));
    await batch.commit().catch(() => {});
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function deleteNotif(id: string) {
    await deleteDoc(doc(db, "Shops", shopId, "notifications", id)).catch(() => {});
    setNotifs((prev) => prev.filter((n) => n.id !== id));
  }

  async function clearAll() {
    if (!confirm("Clear all notifications? This cannot be undone.")) return;
    setClearing(true);
    // Delete in batches of 490
    const snap = await getDocs(collection(db, "Shops", shopId, "notifications")).catch(() => null);
    if (snap) {
      const chunks: QueryDocumentSnapshot[][] = [];
      for (let i = 0; i < snap.docs.length; i += 490) chunks.push(snap.docs.slice(i, i + 490));
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit().catch(() => {});
      }
    }
    setNotifs([]);
    setHasMore(false);
    setClearing(false);
  }

  const unreadCount = notifs.filter((n) => !n.read).length;
  const rawSearchTerm = searchParams.get("q") ?? "";
  const searchTerm = rawSearchTerm.trim().toLowerCase();
  const filteredNotifs = searchTerm
    ? notifs.filter((n) => {
        const haystack = [
          n.title,
          n.subtitle,
          n.type,
          typeLabel(n.type),
          timeAgo(n.ts),
          n.read ? "read" : "unread",
        ];
        return haystack.some((value) => value.toLowerCase().includes(searchTerm));
      })
    : notifs;
  const countText = loading
    ? "Loading…"
    : notifs.length === 0
      ? "No notifications"
      : `${notifs.length}${hasMore ? "+" : ""} notifications · ${unreadCount} unread${searchTerm ? ` · ${filteredNotifs.length} matching "${rawSearchTerm.trim()}"` : ""}`;

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {countText}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Mark all read
            </button>
          )}
          {notifs.length > 0 && (
            <button
              onClick={clearAll}
              disabled={clearing}
              className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Clear all"}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="size-8 rounded-full border-2 border-[#056abf] border-t-transparent animate-spin" />
        </div>
      ) : notifs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" className="mb-3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <p className="text-sm font-semibold text-slate-400">No notifications yet</p>
          <p className="text-xs text-slate-300 mt-1">Orders, reviews, and stock alerts will appear here</p>
        </div>
      ) : filteredNotifs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" className="mb-3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <p className="text-sm font-semibold text-slate-400">No matching notifications</p>
          <p className="text-xs text-slate-300 mt-1">Try searching an order, stock alert, payout, or review keyword.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {filteredNotifs.map((n) => {
            const { bg } = typeColors(n.type);
            return (
              <div
                key={n.id}
                className={`flex items-start gap-4 px-4 py-4 transition-colors ${!n.read ? "bg-blue-50/30" : "hover:bg-slate-50"}`}
              >
                {/* Icon */}
                <div className={`size-9 rounded-full grid place-items-center shrink-0 mt-0.5 ${bg}`}>
                  <TypeIcon type={n.type} />
                </div>

                {/* Content — clickable */}
                <Link
                  href={notifHref(n.type)}
                  onClick={() => { if (!n.read) markRead(n.id); }}
                  className="flex-1 min-w-0 no-underline"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm text-slate-900 truncate ${!n.read ? "font-black" : "font-semibold"}`}>
                      {n.title}
                    </p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${typeColors(n.type).badge}`}>
                      {typeLabel(n.type)}
                    </span>
                    {!n.read && <span className="size-2 rounded-full bg-blue-500 shrink-0" />}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5 truncate">{n.subtitle}</p>
                  <p className="text-xs text-slate-400 mt-1">{timeAgo(n.ts)}</p>
                </Link>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {!n.read && (
                    <button
                      onClick={() => markRead(n.id)}
                      title="Mark as read"
                      className="size-7 rounded-lg grid place-items-center text-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotif(n.id)}
                    title="Delete"
                    className="size-7 rounded-lg grid place-items-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center py-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="h-9 rounded-lg border border-slate-200 px-6 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
