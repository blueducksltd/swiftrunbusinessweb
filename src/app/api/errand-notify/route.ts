import { NextResponse } from "next/server";

const DEFAULT_ADMIN_URL = "https://add.min.swiftrunapp.com";

export async function POST(request: Request) {
  const adminUrl = (process.env.ADMIN_BACKEND_URL || DEFAULT_ADMIN_URL).replace(/\/$/, "");
  const secret = process.env.BUSINESS_SYNC_SECRET;

  if (!secret) {
    return NextResponse.json({ ok: false, error: "Sync secret not configured." }, { status: 500 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const res = await fetch(`${adminUrl}/api/errand-orders/notify/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Swiftrun-Sync-Secret": secret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ ok: res.ok }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
