import { NextResponse } from "next/server";

const DEFAULT_ADMIN_URL = "https://api.swiftrunapp.com";

export async function POST(request: Request) {
  const adminUrl = (process.env.ADMIN_BACKEND_URL || DEFAULT_ADMIN_URL).replace(/\/$/, "");
  const secret = process.env.BUSINESS_SYNC_SECRET;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Business sync secret is not configured." },
      { status: 500 }
    );
  }

  const payload = await request.json();
  const res = await fetch(`${adminUrl}/api/shops/sync-profile/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Swiftrun-Sync-Secret": secret,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({ ok: false, error: "Invalid admin response" }));
  return NextResponse.json(data, { status: res.status });
}
