import { NextResponse } from "next/server";

const ADMIN_URL = (process.env.ADMIN_BACKEND_URL || "https://add.min.swiftrunapp.com").replace(/\/$/, "");

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${ADMIN_URL}/api/ads/charge/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, paymentMethod: "balance" }),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
