import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://api.swiftrunapp.com").replace(/\/$/, "");

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const shopId = String(body.shopId || body.shop_id || "").trim();
  const access = await verifyBusinessShopAccess(request, shopId, "owner");
  if (!access.ok) return NextResponse.json({ ok: false, reason: access.error }, { status: access.status });
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ ok: false, reason: "Not configured" }, { status: 500 });
  const resumeAdId = String(body.resumeAdId || "").trim();
  const ad = resumeAdId ? await adminDb().collection("BusinessAds").doc(resumeAdId).get() : null;
  if (!ad?.exists || ad.data()?.shopId !== access.access.shopId) {
    return NextResponse.json({ ok: false, reason: "Ad not found for this shop" }, { status: 404 });
  }
  const res = await fetch(`${ADMIN_URL}/api/ads/charge/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Swiftrun-Sync-Secret": secret },
    body: JSON.stringify({ ...body, shopId: access.access.shopId, resumeAdId, paymentMethod: "balance" }),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
