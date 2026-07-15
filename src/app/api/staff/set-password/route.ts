import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password, memberId, shopId } = await req.json() as {
      email: string; password: string; memberId?: string; shopId: string;
    };
    if (!email || !password || !shopId) {
      return NextResponse.json({ ok: false, reason: "Missing email or password" }, { status: 400 });
    }
    const access = await verifyBusinessShopAccess(req, shopId, "owner");
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.error }, { status: access.status });
    const normalizedEmail = email.toLowerCase().trim();
    const members = adminDb().collection("Shops").doc(access.access.shopId).collection("members");
    const member = memberId
      ? await members.doc(memberId).get()
      : (await members.where("email", "==", normalizedEmail).limit(1).get()).docs[0];
    if (!member?.exists || String(member.data()?.email ?? "").toLowerCase().trim() !== normalizedEmail) {
      return NextResponse.json({ ok: false, reason: "Staff member not found for this shop" }, { status: 404 });
    }
    const auth = adminAuth();
    const authUid = String(member.data()?.authUid || member.id);
    let user;
    try { user = await auth.getUser(authUid); } catch { user = await auth.getUserByEmail(normalizedEmail); }
    await auth.updateUser(user.uid, { password });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[staff/set-password]", err);
    return NextResponse.json({ ok: false, reason: String(err) }, { status: 500 });
  }
}
