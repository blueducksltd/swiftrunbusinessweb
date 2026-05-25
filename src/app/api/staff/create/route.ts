import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { email, password, firstName, lastName, role, shopId, shopName } =
      await req.json() as {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role: string;
        shopId: string;
        shopName: string;
      };

    if (!email || !password || !shopId) {
      return NextResponse.json({ ok: false, reason: "Missing required fields" }, { status: 400 });
    }

    const auth = adminAuth();
    const db = adminDb();

    // Create or get Firebase Auth user
    let uid: string;
    try {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
      await auth.updateUser(uid, { password, displayName: `${firstName} ${lastName}`.trim() });
    } catch {
      const created = await auth.createUser({
        email,
        password,
        displayName: `${firstName} ${lastName}`.trim(),
        emailVerified: true,
      });
      uid = created.uid;
    }

    // Write member record to Firestore
    await db.collection("Shops").doc(shopId).collection("members").doc(uid).set({
      firstName,
      lastName,
      email,
      role: role || "Staff",
      isActive: true,
      shopName,
      invitedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ ok: true, uid });
  } catch (err) {
    console.error("[staff/create]", err);
    return NextResponse.json({ ok: false, reason: String(err) }, { status: 500 });
  }
}
