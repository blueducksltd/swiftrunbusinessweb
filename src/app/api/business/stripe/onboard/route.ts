import { NextResponse } from "next/server";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://add.min.swiftrunapp.com").replace(/\/$/, "");

// Proxies a Stripe Connect onboarding request for a shop to Django, which
// creates (or reuses) the Connect account and returns a Stripe-hosted
// onboarding URL. Authenticated with the shared sync secret like the other
// business payout-account endpoints.
export async function POST(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const body = await request.text();
  const res = await fetch(`${ADMIN_URL}/api/business/stripe/onboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Swiftrun-Sync-Secret": secret },
    body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ error: "Request failed" }));
  return NextResponse.json(data, { status: res.status });
}
