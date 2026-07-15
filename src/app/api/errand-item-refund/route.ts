import { NextResponse } from "next/server";
import { verifyBusinessShopAccess } from "@/lib/business-auth";
import { adminDb } from "@/lib/firebase-admin";

const DEFAULT_ADMIN_URL = "https://api.swiftrunapp.com";

export async function POST(request: Request) {
  const adminUrl = (process.env.ADMIN_BACKEND_URL || DEFAULT_ADMIN_URL).replace(/\/$/, "");
  const secret = process.env.BUSINESS_SYNC_SECRET;

  if (!secret) {
    return NextResponse.json({ ok: false, error: "Sync secret not configured." }, { status: 500 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const shopId = String(payload.shopId || payload.shop_id || "").trim();
  const access = await verifyBusinessShopAccess(request, shopId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }
  const orderId = String(payload.orderId || payload.order_id || "").trim();
  const itemKey = String(payload.itemKey || payload.item_key || "").trim();
  if (!orderId || !itemKey) {
    return NextResponse.json({ ok: false, error: "orderId and itemKey are required" }, { status: 400 });
  }
  const orderSnap = await adminDb().collection("ErrandOrders").doc(orderId).get();
  const order = orderSnap.data();
  if (!orderSnap.exists || order?.shopId !== access.access.shopId) {
    return NextResponse.json({ ok: false, error: "Order not found for this shop" }, { status: 404 });
  }
  const blockedStatuses = new Set([
    "cancelled", "payment_failed", "payment_pending", "picked_up", "delivered",
    "completed", "laundry_picked_up_from_store", "laundry_delivered",
  ]);
  if (blockedStatuses.has(String(order.status ?? "").toLowerCase())) {
    return NextResponse.json({ ok: false, error: "Order is not eligible for item refund" }, { status: 409 });
  }
  const items = Array.isArray(order.items) ? order.items : [];
  const itemIndex = items.findIndex((candidate: Record<string, unknown>, index: number) => {
    const canonical = String(candidate.lineId || `${candidate.productId || "item"}_${index}`);
    const fallback = `${candidate.productId || "item"}_${index}`;
    return itemKey === canonical || itemKey === fallback;
  });
  const item = items[itemIndex] as Record<string, unknown> | undefined;
  if (!item) return NextResponse.json({ ok: false, error: "Item not found on order" }, { status: 404 });
  const canonicalItemKey = String(item.lineId || `${item.productId || "item"}_${itemIndex}`);
  const qty = Math.max(1, Math.trunc(Number(item.qty ?? 1)));
  const currentUnavailableQty = Math.max(0, Math.trunc(Number(item.unavailableQty ?? 0)));
  const targetUnavailableQty = Math.trunc(Number(payload.targetUnavailableQty ?? payload.unavailableQty ?? 0));
  if (targetUnavailableQty < Math.max(1, currentUnavailableQty) || targetUnavailableQty > qty) {
    return NextResponse.json({ ok: false, error: "Invalid cumulative unavailable quantity" }, { status: 400 });
  }
  const trustedPayload = {
    ...payload,
    orderId,
    shopId: access.access.shopId,
    itemKey: canonicalItemKey,
    unavailableQty: targetUnavailableQty,
    targetUnavailableQty,
    idempotencyKey: `errand_item_refund:${orderId}:${canonicalItemKey}:${targetUnavailableQty}`,
    actorName: access.access.email || access.access.memberRole,
  };

  try {
    const res = await fetch(`${adminUrl}/api/internal/errand-item-refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Swiftrun-Sync-Secret": secret,
      },
      body: JSON.stringify(trustedPayload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ ok: res.ok }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
