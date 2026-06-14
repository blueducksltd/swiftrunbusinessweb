import { NextResponse } from "next/server";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://add.min.swiftrunapp.com").replace(/\/$/, "");

// Forwards a business payout request to Django. Ownership is enforced there
// from the owner's Firebase ID token (passed through as the Authorization
// header), and the withdrawable amount is re-checked server-side, so this proxy
// only needs to relay the call — it does not trust the client's numbers.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();

  const res = await fetch(`${ADMIN_URL}/api/business/request-withdrawal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ error: "Request failed" }));
  return NextResponse.json(data, { status: res.status });
}
