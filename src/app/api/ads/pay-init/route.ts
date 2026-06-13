import { NextResponse } from "next/server";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://add.min.swiftrunapp.com").replace(/\/$/, "");

/** Starts a card payment for an ad. Django holds the gateway secrets and
 *  returns a checkout URL; the ad is only created after payment verifies. */
export async function POST(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ ok: false, reason: "Not configured" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${ADMIN_URL}/api/ads/pay-init/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Swiftrun-Sync-Secret": secret },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
