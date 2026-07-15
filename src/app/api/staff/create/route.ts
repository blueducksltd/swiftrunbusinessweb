import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

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
    const access = await verifyBusinessShopAccess(req, shopId, "owner");
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.error }, { status: access.status });

    const auth = adminAuth();
    const db = adminDb();
    const normalizedEmail = email.toLowerCase().trim();

    // Create or get Firebase Auth user
    let uid: string;
    let existing = null;
    try {
      existing = await auth.getUserByEmail(normalizedEmail);
    } catch (err) {
      if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    }
    if (existing) {
      uid = existing.uid;
      const existingMember = await db.collection("Shops").doc(access.access.shopId).collection("members").doc(uid).get();
      if (!existingMember.exists) {
        return NextResponse.json(
          { ok: false, reason: "An account already exists for this email. Invite the existing account instead." },
          { status: 409 },
        );
      }
      await auth.updateUser(uid, { password, displayName: `${firstName} ${lastName}`.trim() });
    } else {
      const created = await auth.createUser({
        email: normalizedEmail,
        password,
        displayName: `${firstName} ${lastName}`.trim(),
        emailVerified: true,
      });
      uid = created.uid;
    }

    // Write member record to Firestore
    await db.collection("Shops").doc(access.access.shopId).collection("members").doc(uid).set({
      firstName,
      lastName,
      email: normalizedEmail,
      role: role === "Manager" ? "Manager" : "Staff",
      isActive: true,
      shopName: String(access.access.shop.name ?? shopName ?? ""),
      authUid: uid,
      invitedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ ok: true, uid });
  } catch (err) {
    console.error("[staff/create]", err);
    return NextResponse.json({ ok: false, reason: String(err) }, { status: 500 });
  }
}
