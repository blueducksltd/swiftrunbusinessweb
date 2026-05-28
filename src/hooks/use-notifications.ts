"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  getDocs,
  getDoc,
  setDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fmtCurrency } from "@/lib/currency";

// ── Types ──────────────────────────────────────────────────────────────────

export type NotifType =
  | "order_new"
  | "order_delivered"
  | "order_cancelled"
  | "order_driver_arrived"
  | "stock_low"
  | "stock_out"
  | "rating_new";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  subtitle: string;
  ts: number;
  read: boolean;
}

// ── Local cache for clearedAt (fast synchronous read on mount) ─────────────

const CLEARED_KEY = "sr_biz_cleared_at";

function loadClearedAt(): number {
  try {
    return parseFloat(localStorage.getItem(CLEARED_KEY) || "0");
  } catch {
    return 0;
  }
}

function saveClearedAt(ts: number) {
  try {
    localStorage.setItem(CLEARED_KEY, ts.toString());
  } catch {}
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useNotifications(shopId: string, shopEmail: string, shopCurrency?: string) {
  // Raw notifications — read field is derived at return time from clearedAt
  const [notifications, setNotifications] = useState<Omit<AppNotification, "read">[]>([]);

  // clearedAt: any notification with ts <= clearedAt is considered read.
  // Stored in Firestore so it syncs across all devices.
  const [clearedAt, setClearedAt] = useState<number>(loadClearedAt);

  const ordersReady = useRef(false);
  const productsReady = useRef(false);
  const reviewsReady = useRef(false);
  const prevStocks = useRef<Map<string, { stock: number; available: boolean }>>(new Map());

  // ── Load clearedAt from Firestore on mount (cross-device sync) ────────────

  useEffect(() => {
    if (!shopId) return;
    getDoc(doc(db, "Shops", shopId, "notificationMeta", "state"))
      .then((snap) => {
        if (snap.exists()) {
          const ts = (snap.data().clearedAt as number) ?? 0;
          if (ts > clearedAt) {
            setClearedAt(ts);
            saveClearedAt(ts);
          }
        }
      })
      .catch(() => {});
  }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load persisted portal notifications (status changes, stock alerts) ────

  useEffect(() => {
    if (!shopId) return;
    getDocs(
      query(
        collection(db, "Shops", shopId, "businessNotifications"),
        orderBy("ts", "desc"),
        limit(60)
      )
    ).then((snap) => {
      const loaded = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type as NotifType,
          title: data.title as string,
          subtitle: data.subtitle as string,
          ts: data.ts as number,
        };
      });
      if (loaded.length > 0) {
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const fresh = loaded.filter((n) => !existingIds.has(n.id));
          return [...prev, ...fresh].sort((a, b) => b.ts - a.ts).slice(0, 60);
        });
      }
    }).catch(() => {});
  }, [shopId]);

  // ── Load recent orders directly from ErrandOrders ────────────────────────

  useEffect(() => {
    if (!shopId) return;
    getDocs(
      query(
        collection(db, "ErrandOrders"),
        where("shopId", "==", shopId),
        orderBy("createdAt", "desc"),
        limit(30)
      )
    ).then((snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        const id = `order_new_${d.id}`;
        const ts: number = data.createdAt?.toMillis?.() ?? (data.createdAt?._seconds ?? 0) * 1000;
        const num = data.orderNumber ?? d.id.slice(0, 6).toUpperCase();
        const amt = fmtCurrency(data.total ?? 0, shopCurrency);
        return { id, type: "order_new" as NotifType, title: "New Order", subtitle: `#${num} — ${amt}`, ts };
      });
      if (items.length > 0) {
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const fresh = items.filter((n) => !existingIds.has(n.id));
          return [...prev, ...fresh].sort((a, b) => b.ts - a.ts).slice(0, 60);
        });
      }
    }).catch(() => {});
  }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load recent reviews directly from Shops/{shopId}/reviews ─────────────

  useEffect(() => {
    if (!shopId) return;
    getDocs(
      query(
        collection(db, "Shops", shopId, "reviews"),
        orderBy("createdAt", "desc"),
        limit(15)
      )
    ).then((snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        const id = `rating_new_${d.id}`;
        const ts: number = data.createdAt?.toMillis?.() ?? (data.createdAt?._seconds ?? 0) * 1000;
        const rating = (data.rating as number) ?? 0;
        const reviewer = (data.userName as string) ?? (data.name as string) ?? "Customer";
        return { id, type: "rating_new" as NotifType, title: "New Review", subtitle: `${rating}/5 stars — ${reviewer}`, ts };
      });
      if (items.length > 0) {
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const fresh = items.filter((n) => !existingIds.has(n.id));
          return [...prev, ...fresh].sort((a, b) => b.ts - a.ts).slice(0, 60);
        });
      }
    }).catch(() => {});
  }, [shopId]);

  const push = useCallback(
    (notif: Omit<AppNotification, "read">) => {
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        return [notif, ...prev].slice(0, 60);
      });
      _sendEmail(notif, shopEmail);
      if (shopId) {
        setDoc(
          doc(db, "Shops", shopId, "businessNotifications", notif.id),
          { type: notif.type, title: notif.title, subtitle: notif.subtitle, ts: notif.ts, createdAt: serverTimestamp() },
          { merge: true }
        ).catch(() => {});
      }
    },
    [shopEmail, shopId]
  );

  // ── Orders stream ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!shopId) return;
    ordersReady.current = false;

    const q = query(
      collection(db, "ErrandOrders"),
      where("shopId", "==", shopId),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (!ordersReady.current) return;

        const d = change.doc.data();
        const id = change.doc.id;
        const num = d.orderNumber ?? id.slice(0, 6).toUpperCase();
        const amt = fmtCurrency(d.total ?? 0, shopCurrency);

        if (change.type === "added") {
          push({ id: `order_new_${id}`, type: "order_new", title: "New Order", subtitle: `#${num} — ${amt}`, ts: Date.now() });
        } else if (change.type === "modified") {
          if (d.status === "delivered") {
            push({ id: `done_${id}`, type: "order_delivered", title: "Order Completed", subtitle: `#${num} — ${amt}`, ts: Date.now() });
          } else if (d.status === "cancelled") {
            push({ id: `cancel_${id}`, type: "order_cancelled", title: "Order Cancelled", subtitle: `#${num} — ${amt}`, ts: Date.now() });
          } else if (d.status === "driver_at_shop") {
            push({ id: `arrived_${id}`, type: "order_driver_arrived", title: "Driver Arrived", subtitle: `Driver is at your store for order #${num}`, ts: Date.now() });
          }
        }
      });
      ordersReady.current = true;
    });

    return () => { unsub(); ordersReady.current = false; };
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
        const id = change.doc.id;
        const rating = (d.rating as number) || 0;
        const reviewer = (d.userName as string) || (d.name as string) || "Customer";
        push({
          id: `rating_new_${id}`,
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

  // ── Mark all read — writes clearedAt to Firestore for cross-device sync ───

  const markAllRead = useCallback(() => {
    const now = Date.now();
    setClearedAt(now);
    saveClearedAt(now);
    if (shopId) {
      setDoc(
        doc(db, "Shops", shopId, "notificationMeta", "state"),
        { clearedAt: now },
        { merge: true }
      ).catch(() => {});
    }
  }, [shopId]);

  // ── Derive read field from clearedAt at render time ────────────────────

  const displayNotifications = useMemo(
    () => notifications.map((n) => ({ ...n, read: n.ts <= clearedAt })),
    [notifications, clearedAt]
  );

  const unreadCount = useMemo(
    () => displayNotifications.filter((n) => !n.read).length,
    [displayNotifications]
  );

  return { notifications: displayNotifications, unreadCount, markAllRead };
}

// ── Email helper ───────────────────────────────────────────────────────────

async function _sendEmail(notif: Omit<AppNotification, "read">, shopEmail: string) {
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: notif.type, title: notif.title, subtitle: notif.subtitle, shopEmail }),
    });
  } catch {
    // non-fatal
  }
}

// ── Time helper (exported for header) ─────────────────────────────────────

export function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
