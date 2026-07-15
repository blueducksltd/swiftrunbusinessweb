import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export type BusinessRole = "owner" | "member";

export type BusinessAccess = {
  uid: string;
  email: string;
  role: BusinessRole;
  memberRole: string;
  shopId: string;
  shop: DocumentData;
  shopRef: DocumentReference;
};

export type AccessResult =
  | { ok: true; access: BusinessAccess }
  | { ok: false; status: number; error: string };

type AccessOptions = {
  requireActiveShop?: boolean;
};

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function shopCanOperate(shop: DocumentData): boolean {
  const status = normalized(shop.status);
  return shop.isActive !== false && (!status || status === "active");
}

function isShopOwner(shop: DocumentData, uid: string, email: string): boolean {
  const ownerUids = [shop.ownerUid, shop.ownerUID, shop.ownerId, shop.ownerID]
    .map(normalized)
    .filter(Boolean);
  const ownerEmails = [shop.ownerEmail, shop.owner_email]
    .map(normalized)
    .filter(Boolean);
  return ownerUids.includes(normalized(uid)) || (!!email && ownerEmails.includes(email));
}

export async function verifyBusinessShopAccess(
  request: Request,
  shopId: string,
  requiredRole: BusinessRole = "member",
  options: AccessOptions = {},
): Promise<AccessResult> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const verifiedShopId = shopId.trim();
  if (!token) return { ok: false, status: 401, error: "Unauthorized" };
  if (!verifiedShopId) return { ok: false, status: 400, error: "Missing shopId" };

  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const email = normalized(decoded.email);
    const shopRef = adminDb().collection("Shops").doc(verifiedShopId);
    const shopSnap = await shopRef.get();
    if (!shopSnap.exists) return { ok: false, status: 404, error: "Shop not found" };

    const shop = shopSnap.data() ?? {};
    if (options.requireActiveShop !== false && !shopCanOperate(shop)) {
      return { ok: false, status: 403, error: "Shop is not active" };
    }

    if (isShopOwner(shop, decoded.uid, email)) {
      return {
        ok: true,
        access: {
          uid: decoded.uid,
          email,
          role: "owner",
          memberRole: "owner",
          shopId: verifiedShopId,
          shop,
          shopRef,
        },
      };
    }

    if (requiredRole === "owner") {
      return { ok: false, status: 403, error: "Owner access required" };
    }

    const members = shopRef.collection("members");
    let memberSnap = await members.doc(decoded.uid).get();
    if (!memberSnap.exists && email) {
      const emailMembers = await members.where("email", "==", email).limit(1).get();
      if (!emailMembers.empty) memberSnap = emailMembers.docs[0];
    }
    if (!memberSnap.exists || memberSnap.data()?.isActive === false) {
      return { ok: false, status: 403, error: "Active shop membership required" };
    }

    return {
      ok: true,
      access: {
        uid: decoded.uid,
        email,
        role: "member",
        memberRole: normalized(memberSnap.data()?.role) || "member",
        shopId: verifiedShopId,
        shop,
        shopRef,
      },
    };
  } catch {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
}
