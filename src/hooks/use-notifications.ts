"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fmtCurrency } from "@/lib/currency";
import { storeOrderAmount, type ErrandOrder } from "@/lib/firestore";
import { isConfirmedErrandOrder } from "@/lib/firestore";
import { authenticatedFetch } from "@/lib/authenticated-fetch";

// ── Types ──────────────────────────────────────────────────────────────────

export type NotifType =
  | "order_new"
  | "order_delivered"
  | "order_cancelled"
  | "order_driver_arrived"
  | "stock_low"
  | "stock_out"
  | "rating_new"
  | "payout";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  subtitle: string;
  ts: number;
  read: boolean;
}

function cancellationActor(data: Record<string, unknown>): string {
  const role = String(data.cancelledByRole ?? data.cancelledBy ?? "").toLowerCase();
  const reason = String(data.cancelReason ?? "").toLowerCase();
  const name = String(data.cancelledByName ?? "").trim();
  if (role === "store" || reason.includes("store")) return name ? `Store: ${name}` : "Store";
  if (role === "driver") return name ? `Driver: ${name}` : "Driver";
  if (role === "customer" || role === "user") return name ? `Customer: ${name}` : "Customer";
  return name || "Unknown";
}

function cancellationSubtitle(num: string, amt: string, data: Record<string, unknown>): string {
  const reason = String(data.cancelReason ?? "").trim();
  const actor = cancellationActor(data);
  return reason
    ? `#${num} - ${amt} - Cancelled by ${actor}. Reason: ${reason}`
    : `#${num} - ${amt} - Cancelled by ${actor}`;
}

// ── Firestore path helpers ─────────────────────────────────────────────────
// Collection: Shops/{shopId}/notifications
// If Firestore rules block this, update rules to:
//   match /Shops/{shopId}/notifications/{id} { allow read, write: if request.auth != null; }

const notifsColl = (shopId: string) =>
  collection(db, "Shops", shopId, "notifications");

const notifDoc = (shopId: string, id: string) =>
  doc(db, "Shops", shopId, "notifications", id);

// ── Hook ───────────────────────────────────────────────────────────────────

export function useNotifications(shopId: string, _shopEmail: string, shopCurrency?: string) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const ordersReady = useRef(false);
  const confirmedOrderIds = useRef<Set<string>>(new Set());
  const productsReady = useRef(false);
  const reviewsReady = useRef(false);
  const prevStocks = useRef<Map<string, { stock: number; available: boolean }>>(new Map());

  // ── On mount: load last 60 from Firestore into local state ─────────────
  // Uses getDocs (one-time read) — reliable across security rule variations.
  // Also subscribes via onSnapshot for real-time updates while tab is open.

  useEffect(() => {
    if (!shopId) return;

    const q = query(notifsColl(shopId), orderBy("ts", "desc"), limit(60));

    // Initial load — populates bell immediately
    getDocs(q)
      .then((snap) => {
        const loaded: AppNotification[] = snap.docs.map((d) => ({
          id: d.id,
          type: d.data().type as NotifType,
          title: d.data().title as string,
          subtitle: d.data().subtitle as string,
          ts: d.data().ts as number,
          read: (d.data().read as boolean) ?? false,
        }));
        if (loaded.length > 0) {
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            const fresh = loaded.filter((n) => !existingIds.has(n.id));
            return [...prev, ...fresh].sort((a, b) => b.ts - a.ts).slice(0, 60);
          });
        }
      })
      .catch(() => {});

    // Real-time listener — keeps bell current while tab is open
    const unsub = onSnapshot(
      q,
      (snap) => {
        const live: AppNotification[] = snap.docs.map((d) => ({
          id: d.id,
          type: d.data().type as NotifType,
          title: d.data().title as string,
          subtitle: d.data().subtitle as string,
          ts: d.data().ts as number,
          read: (d.data().read as boolean) ?? false,
        }));
        setNotifications(live);
      },
      () => {} // silent error — getDocs fallback already populated state
    );

    return () => unsub();
  }, [shopId]);

  // ── Mount sync: backfill orders & reviews that arrived while portal was closed

  useEffect(() => {
    if (!shopId) return;

    async function sync() {
      const latestSnap = await getDocs(
        query(notifsColl(shopId), orderBy("ts", "desc"), limit(1))
      );
      const since: number = latestSnap.empty
        ? 0
        : ((latestSnap.docs[0].data().ts as number) ?? 0);

      const batch = writeBatch(db);
      let writes = 0;

      const ordersSnap = await getDocs(
        query(
          collection(db, "ErrandOrders"),
          where("shopId", "==", shopId),
          limit(30)
        )
      );
      for (const d of ordersSnap.docs) {
        const data = d.data();
        if (!isConfirmedErrandOrder(data)) continue;
        confirmedOrderIds.current.add(d.id);
        const ts: number =
          data.createdAt?.toMillis?.() ?? (data.createdAt?._seconds ?? 0) * 1000;
        if (ts <= since) continue;
        const num = data.orderNumber ?? d.id.slice(0, 6).toUpperCase();
        const amt = fmtCurrency(storeOrderAmount(data as ErrandOrder), shopCurrency);
        batch.set(notifDoc(shopId, `order_new_${d.id}`), {
          type: "order_new",
          title: "New Order",
          subtitle: `#${num} — ${amt}`,
          ts,
          read: false,
          createdAt: serverTimestamp(),
        });
        if (++writes >= 490) break;
      }

      const reviewsSnap = await getDocs(
        query(
          collection(db, "Shops", shopId, "reviews"),
          orderBy("createdAt", "desc"),
          limit(15)
        )
      );
      for (const d of reviewsSnap.docs) {
        const data = d.data();
        const ts: number =
          data.createdAt?.toMillis?.() ?? (data.createdAt?._seconds ?? 0) * 1000;
        if (ts <= since) break;
        const rating = (data.rating as number) ?? 0;
        const reviewer =
          (data.userName as string) ?? (data.name as string) ?? "Customer";
        batch.set(notifDoc(shopId, `rating_new_${d.id}`), {
          type: "rating_new",
          title: "New Review",
          subtitle: `${rating}/5 stars — ${reviewer}`,
          ts,
          read: false,
          createdAt: serverTimestamp(),
        });
        if (++writes >= 490) break;
      }

      if (writes > 0) await batch.commit().catch(() => {});
    }

    sync().catch(() => {});
  }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Write notification to Firestore + update local state immediately ────

  const push = useCallback(
    (notif: Omit<AppNotification, "read">) => {
      // Update local state immediately (no wait for Firestore round-trip)
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        return [{ ...notif, read: false }, ...prev].slice(0, 60);
      });

      // Persist to Firestore
      if (shopId) {
        setDoc(
          notifDoc(shopId, notif.id),
          {
            type: notif.type,
            title: notif.title,
            subtitle: notif.subtitle,
            ts: notif.ts,
            read: false,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {});
      }

      _sendEmail(notif, shopId);
    },
    [shopId]
  );

  // ── Orders stream ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!shopId) return;
    ordersReady.current = false;
    confirmedOrderIds.current = new Set();
    const q = query(
      collection(db, "ErrandOrders"),
      where("shopId", "==", shopId),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (!ordersReady.current) return;
        const d = change.doc.data();
        const id = change.doc.id;
        const confirmed = isConfirmedErrandOrder(d);
        if (!confirmed) return;
        const firstConfirmed = !confirmedOrderIds.current.has(id);
        confirmedOrderIds.current.add(id);
        const num = d.orderNumber ?? id.slice(0, 6).toUpperCase();
        const amt = fmtCurrency(storeOrderAmount(d as ErrandOrder), shopCurrency);
        if (firstConfirmed) {
          push({ id: `order_new_${id}`, type: "order_new", title: "New Order", subtitle: `#${num} - ${amt}`, ts: Date.now() });
        } else if (change.type === "modified") {
          if (["delivered", "completed", "laundry_delivered"].includes(d.status)) {
            push({ id: `done_${id}`, type: "order_delivered", title: "Order Completed", subtitle: `#${num} — ${amt}`, ts: Date.now() });
          } else if (d.status === "cancelled") {
            push({ id: `cancel_${id}`, type: "order_cancelled", title: "Order Cancelled", subtitle: cancellationSubtitle(num, amt, d), ts: Date.now() });
          } else if (d.status === "driver_at_shop") {
            push({ id: `arrived_${id}`, type: "order_driver_arrived", title: "Driver Arrived", subtitle: `Driver is at your store for order #${num}`, ts: Date.now() });
          }
        }
      });
      ordersReady.current = true;
    });
    return () => { unsub(); ordersReady.current = false; confirmedOrderIds.current = new Set(); };
  }, [shopId, push]);

  // ── Products stream ────────────────────────────────────────────────────

  useEffect(() => {
    if (!shopId) return;
    productsReady.current = false;
    prevStocks.current.clear();
    const q = query(
      collection(db, "Products"),
      where("shopId", "==", shopId),
      where("isActive", "==", true)
    );
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        const d = change.doc.data();
        const id = change.doc.id;
        const stock: number = d.stock ?? 0;
        const available: boolean = d.isAvailable ?? true;
        const name: string = d.name ?? "Product";
        if (!productsReady.current) {
          prevStocks.current.set(id, { stock, available });
          return;
        }
        const prev = prevStocks.current.get(id);
        if (change.type === "modified" && prev !== undefined) {
          const wasOut = !prev.available || prev.stock === 0;
          const isOut = !available || stock === 0;
          const wasLow = !wasOut && prev.stock <= 10;
          const isLow = !isOut && stock <= 10;
          if (isOut && !wasOut) {
            push({ id: `out_${id}_${Date.now()}`, type: "stock_out", title: "Out of Stock", subtitle: `${name} — 0 left`, ts: Date.now() });
          } else if (isLow && !wasLow) {
            push({ id: `low_${id}_${Date.now()}`, type: "stock_low", title: "Running Low", subtitle: `${name} — ${stock} left`, ts: Date.now() });
          }
        }
        prevStocks.current.set(id, { stock, available });
      });
      productsReady.current = true;
    });
    return () => { unsub(); productsReady.current = false; };
  }, [shopId, push]);

  // ── Reviews stream ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!shopId) return;
    reviewsReady.current = false;
    const q = query(
      collection(db, "Shops", shopId, "reviews"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (!reviewsReady.current) return;
        if (change.type !== "added") return;
        const d = change.doc.data();
        const rating = (d.rating as number) || 0;
        const reviewer = (d.userName as string) || (d.name as string) || "Customer";
        push({
          id: `rating_new_${change.doc.id}`,
          type: "rating_new",
          title: "New Review",
          subtitle: `${rating}/5 stars — ${reviewer}`,
          ts: Date.now(),
        });
      });
      reviewsReady.current = true;
    });
    return () => { unsub(); reviewsReady.current = false; };
  }, [shopId, push]);

  // ── Mark all read ──────────────────────────────────────────────────────

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (!shopId) return;
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(notifDoc(shopId, n.id), { read: true }));
    await batch.commit().catch(() => {});
  }, [shopId, notifications]);

  // ── Mark single read ───────────────────────────────────────────────────

  const markRead = useCallback(
    (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      if (shopId) {
        updateDoc(notifDoc(shopId, id), { read: true }).catch(() => {});
      }
    },
    [shopId]
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markAllRead, markRead };
}

// ── Email helper ───────────────────────────────────────────────────────────

async function _sendEmail(notif: Omit<AppNotification, "read">, shopId: string) {
  try {
    await authenticatedFetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: notif.type,
        title: notif.title,
        subtitle: notif.subtitle,
        shopId,
      }),
    });
  } catch {}
}

// ── Time helper ────────────────────────────────────────────────────────────

export function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
