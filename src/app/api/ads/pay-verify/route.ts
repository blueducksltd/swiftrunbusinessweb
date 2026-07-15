import { NextResponse } from "next/server";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://api.swiftrunapp.com").replace(/\/$/, "");

/** Verifies a card payment with the gateway (via Django) and, on success,
 *  the ad is created server-side. */
export async function POST(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ ok: false, reason: "Not configured" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const shopId = String(body.shopId || body.shop_id || "").trim();
  const access = await verifyBusinessShopAccess(request, shopId, "owner");
  if (!access.ok) return NextResponse.json({ ok: false, reason: access.error }, { status: access.status });
  const reference = String(body.reference || "").trim();
  if (!reference || !reference.startsWith(`ad-${access.access.shopId.slice(0, 10)}-`)) {
    return NextResponse.json({ ok: false, reason: "Payment reference does not belong to this shop" }, { status: 403 });
  }
  const res = await fetch(`${ADMIN_URL}/api/ads/pay-verify/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Swiftrun-Sync-Secret": secret },
    body: JSON.stringify({ ...body, shopId: access.access.shopId }),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
