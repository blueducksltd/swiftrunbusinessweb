import { NextResponse } from "next/server";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://api.swiftrunapp.com").replace(/\/$/, "");

// Proxies a Stripe Connect onboarding request for a shop to Django, which
// creates (or reuses) the Connect account and returns a Stripe-hosted
// onboarding URL. Authenticated with the shared sync secret like the other
// business payout-account endpoints.
export async function POST(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const shopId = String(body.shopId || body.shop_id || "").trim();
  const access = await verifyBusinessShopAccess(request, shopId, "owner");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const country = String(access.access.shop.countryCode ?? access.access.shop.isoCode ?? body.country ?? "").toUpperCase();
  const email = String(access.access.shop.ownerEmail ?? access.access.email).trim();
  const res = await fetch(`${ADMIN_URL}/api/business/stripe/onboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Swiftrun-Sync-Secret": secret },
    body: JSON.stringify({ ...body, shop_id: access.access.shopId, email, country }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ error: "Request failed" }));
  return NextResponse.json(data, { status: res.status });
}
