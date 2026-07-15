import { NextResponse } from "next/server";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://api.swiftrunapp.com").replace(/\/$/, "");

export async function GET(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get("shop_id") ?? "";
  const access = await verifyBusinessShopAccess(request, shopId, "owner");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const currency = String(access.access.shop.currency ?? access.access.shop.currencyCode ?? "NGN").toUpperCase();

  const res = await fetch(`${ADMIN_URL}/api/business/banks?currency=${encodeURIComponent(currency)}`, {
    headers: { "X-Swiftrun-Sync-Secret": secret },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ banks: [] }));
  return NextResponse.json(data, { status: res.status });
}
