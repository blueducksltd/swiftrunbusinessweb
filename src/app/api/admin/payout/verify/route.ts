import { NextResponse } from "next/server";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://api.swiftrunapp.com").replace(/\/$/, "");

export async function POST(request: Request) {
  const secret = process.env.BUSINESS_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const shopId = String(body.shopId || body.shop_id || "").trim();
  const access = await verifyBusinessShopAccess(request, shopId, "owner");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const res = await fetch(`${ADMIN_URL}/api/business/verify-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Swiftrun-Sync-Secret": secret },
    body: JSON.stringify({ ...body, shop_id: access.access.shopId }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ error: "Invalid response" }));
  return NextResponse.json(data, { status: res.status });
}
