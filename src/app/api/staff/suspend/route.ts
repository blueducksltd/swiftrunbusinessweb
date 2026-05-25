import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const { email, shopId, suspend } = await req.json() as {
      email: string;
      shopId: string;
      suspend: boolean;
    };
    if (!email || !shopId) {
      return NextResponse.json({ ok: false, reason: "Missing email or shopId" }, { status: 400 });
    }
    const auth = adminAuth();
    const db = adminDb();

    // Update Firebase Auth
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { disabled: suspend });

    // Keep Firestore isActive in sync
    await db.collection("Shops").doc(shopId).collection("members").doc(user.uid).update({
      isActive: !suspend,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[staff/suspend]", err);
    return NextResponse.json({ ok: false, reason: String(err) }, { status: 500 });
  }
}
