import { NextResponse } from "next/server";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://add.min.swiftrunapp.com").replace(/\/$/, "");

export async function GET(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get("shop_id") ?? "";

  const res = await fetch(`${ADMIN_URL}/api/business/payout-history?shop_id=${encodeURIComponent(shopId)}`, {
    headers: { "X-Swiftrun-Sync-Secret": secret },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ payouts: [] }));
  return NextResponse.json(data, { status: res.status });
}
