import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email: string; password: string };
    if (!email || !password) {
      return NextResponse.json({ ok: false, reason: "Missing email or password" }, { status: 400 });
    }
    const auth = adminAuth();
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[staff/set-password]", err);
    return NextResponse.json({ ok: false, reason: String(err) }, { status: 500 });
  }
}
