import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

export async function POST(req: NextRequest) {
  try {
    const { email, memberId, shopId, suspend } = await req.json() as {
      email: string;
      memberId?: string;
      shopId: string;
      suspend: boolean;
    };
    if (!email || !shopId) {
      return NextResponse.json({ ok: false, reason: "Missing email or shopId" }, { status: 400 });
    }
    const access = await verifyBusinessShopAccess(req, shopId, "owner");
    if (!access.ok) return NextResponse.json({ ok: false, reason: access.error }, { status: access.status });
    const auth = adminAuth();
    const db = adminDb();
    const normalizedEmail = email.toLowerCase().trim();
    const membersRef = db.collection("Shops").doc(access.access.shopId).collection("members");

    const memberRef = memberId
      ? membersRef.doc(memberId)
      : (await membersRef.where("email", "==", normalizedEmail).limit(1).get()).docs[0]?.ref;
    if (!memberRef) {
      return NextResponse.json({ ok: false, reason: "Staff member not found" }, { status: 404 });
    }
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      return NextResponse.json({ ok: false, reason: "Staff member not found" }, { status: 404 });
    }

    const member = memberSnap.data() ?? {};
    if (String(member.email ?? "").toLowerCase().trim() !== normalizedEmail) {
      return NextResponse.json({ ok: false, reason: "Staff member not found for this shop" }, { status: 404 });
    }
    const authUid = typeof member.authUid === "string" && member.authUid
      ? member.authUid
      : memberRef.id;

    let user;
    try {
      user = await auth.getUser(authUid);
    } catch {
      user = await auth.getUserByEmail(normalizedEmail);
    }
    await auth.updateUser(user.uid, { disabled: suspend });

    // Keep Firestore isActive in sync
    await memberRef.update({
      authUid: user.uid,
      email: normalizedEmail,
      isActive: !suspend,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[staff/suspend]", err);
    return NextResponse.json({ ok: false, reason: String(err) }, { status: 500 });
  }
}
