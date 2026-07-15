import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://api.swiftrunapp.com").replace(/\/$/, "");

/** Starts a card payment for an ad. Django holds the gateway secrets and
 *  returns a checkout URL; the ad is only created after payment verifies. */
export async function POST(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ ok: false, reason: "Not configured" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const shopId = String(body.shopId || body.shop_id || "").trim();
  const access = await verifyBusinessShopAccess(request, shopId, "owner");
  if (!access.ok) return NextResponse.json({ ok: false, reason: access.error }, { status: access.status });

  const db = adminDb();
  const resumeAdId = String(body.resumeAdId || "").trim();
  if (resumeAdId) {
    const ad = await db.collection("BusinessAds").doc(resumeAdId).get();
    if (!ad.exists || ad.data()?.shopId !== access.access.shopId) {
      return NextResponse.json({ ok: false, reason: "Ad not found for this shop" }, { status: 404 });
    }
  }
  if (!resumeAdId && !["product", "store"].includes(body.targetType)) {
    return NextResponse.json({ ok: false, reason: "Invalid ad target" }, { status: 400 });
  }
  const productId = String(body.productId || "").trim();
  if (body.targetType === "product") {
    const product = productId ? await db.collection("Products").doc(productId).get() : null;
    if (!product?.exists || product.data()?.shopId !== access.access.shopId) {
      return NextResponse.json({ ok: false, reason: "Product not found for this shop" }, { status: 404 });
    }
  }
  const trustedBody = {
    ...body,
    shopId: access.access.shopId,
    email: String(access.access.shop.ownerEmail ?? access.access.email),
    countryCode: String(access.access.shop.countryCode ?? access.access.shop.isoCode ?? "").toUpperCase(),
  };
  const res = await fetch(`${ADMIN_URL}/api/ads/pay-init/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Swiftrun-Sync-Secret": secret },
    body: JSON.stringify(trustedBody),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
