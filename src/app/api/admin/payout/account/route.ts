import { NextResponse } from "next/server";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://api.swiftrunapp.com").replace(/\/$/, "");

function headers(secret: string) {
  return { "Content-Type": "application/json", "X-Swiftrun-Sync-Secret": secret };
}

export async function GET(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get("shop_id") ?? "";

  const res = await fetch(`${ADMIN_URL}/api/business/payout-account?shop_id=${encodeURIComponent(shopId)}`, {
    headers: { "X-Swiftrun-Sync-Secret": secret },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ account: null }));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${ADMIN_URL}/api/business/payout-account`, {
    method: "POST",
    headers: headers(secret),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ error: "Invalid response" }));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("id") ?? "";

  const res = await fetch(`${ADMIN_URL}/api/business/payout-account/${accountId}/delete`, {
    method: "DELETE",
    headers: { "X-Swiftrun-Sync-Secret": secret },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
