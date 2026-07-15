import { NextResponse } from "next/server";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://api.swiftrunapp.com").replace(/\/$/, "");

// Forwards a business payout request to Django. Ownership is enforced there
// from the owner's Firebase ID token (passed through as the Authorization
// header), and the withdrawable amount is re-checked server-side, so this proxy
// only needs to relay the call — it does not trust the client's numbers.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const shopId = String(body.shopId || body.shop_id || "").trim();
  const access = await verifyBusinessShopAccess(request, shopId, "owner");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const res = await fetch(`${ADMIN_URL}/api/business/request-withdrawal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ ...body, shop_id: access.access.shopId }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ error: "Request failed" }));
  return NextResponse.json(data, { status: res.status });
}
