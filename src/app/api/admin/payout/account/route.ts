import { NextResponse } from "next/server";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://api.swiftrunapp.com").replace(/\/$/, "");

function headers(secret: string) {
  return { "Content-Type": "application/json", "X-Swiftrun-Sync-Secret": secret };
}

async function loadAccount(secret: string, shopId: string) {
  const res = await fetch(`${ADMIN_URL}/api/business/payout-account?shop_id=${encodeURIComponent(shopId)}`, {
    headers: { "X-Swiftrun-Sync-Secret": secret },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ account: null }));
  return { res, data };
}

export async function GET(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get("shop_id") ?? "";
  const access = await verifyBusinessShopAccess(request, shopId, "owner");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { res, data } = await loadAccount(secret, access.access.shopId);
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const shopId = String(body.shopId || body.shop_id || "").trim();
  const access = await verifyBusinessShopAccess(request, shopId, "owner");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const res = await fetch(`${ADMIN_URL}/api/business/payout-account`, {
    method: "POST",
    headers: headers(secret),
    body: JSON.stringify({ ...body, shop_id: access.access.shopId }),
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
  const shopId = searchParams.get("shop_id") ?? "";
  const access = await verifyBusinessShopAccess(request, shopId, "owner");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!accountId) return NextResponse.json({ error: "Missing account id" }, { status: 400 });

  const accountResult = await loadAccount(secret, access.access.shopId);
  if (!accountResult.res.ok) {
    return NextResponse.json(accountResult.data, { status: accountResult.res.status });
  }
  if (!accountResult.data.account || String(accountResult.data.account.id) !== accountId) {
    return NextResponse.json({ error: "Payout account not found for this shop" }, { status: 404 });
  }

  const res = await fetch(`${ADMIN_URL}/api/business/payout-account/${accountId}/delete`, {
    method: "DELETE",
    headers: { "X-Swiftrun-Sync-Secret": secret },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
