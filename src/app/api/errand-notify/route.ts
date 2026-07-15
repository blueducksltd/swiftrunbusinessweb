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
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const orderId = String(payload.orderId || payload.order_id || "").trim();
  const orderSnap = orderId ? await adminDb().collection("ErrandOrders").doc(orderId).get() : null;
  const order = orderSnap?.data();
  if (!orderSnap?.exists || order?.shopId !== access.access.shopId) {
    return NextResponse.json({ ok: false, error: "Order not found for this shop" }, { status: 404 });
  }
  const trustedPayload = {
    orderId,
    shopId: access.access.shopId,
    customerId: String(order.customerId ?? ""),
    driverId: order.driverId ?? null,
    status: String(order.status ?? payload.status ?? ""),
    shopName: String(access.access.shop.name ?? order.shopName ?? "Store"),
  };

  try {
    const res = await fetch(`${adminUrl}/api/errand-orders/notify/`, {
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
