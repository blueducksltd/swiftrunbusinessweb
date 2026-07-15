import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyBusinessShopAccess } from "@/lib/business-auth";

function timestampSeconds(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "object" && "seconds" in value) {
    const seconds = Number((value as { seconds: unknown }).seconds);
    return Number.isFinite(seconds) ? seconds : null;
  }
  if (typeof value === "object" && "toDate" in value) {
    const timestamp = value as { toDate?: () => Date };
    if (typeof timestamp.toDate === "function") return Math.floor(timestamp.toDate().getTime() / 1000);
  }
  const millis = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(millis) ? Math.floor(millis / 1000) : null;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shopId = searchParams.get("shop_id")?.trim() ?? "";
  const access = await verifyBusinessShopAccess(request, shopId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  try {
    const db = adminDb();
    const orderSnap = await db.collection("ErrandOrders").where("shopId", "==", shopId).get();
    const orders = orderSnap.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Record<string, unknown> & { id: string },
    );
    const adminRatings = new Map<string, Record<string, unknown>>();

    for (const orderIds of chunks(orders.map((order) => order.id), 30)) {
      if (orderIds.length === 0) continue;
      for (const linkField of ["tripId", "link_order_id"] as const) {
        const ratingSnap = await db.collection("DriversRatings").where(linkField, "in", orderIds).get();
        for (const ratingDoc of ratingSnap.docs) {
          const rating = ratingDoc.data();
          const tripId = String(rating[linkField] ?? "");
          const existing = adminRatings.get(tripId);
          if (!existing || (timestampSeconds(rating.dateCreated) ?? 0) > (timestampSeconds(existing.dateCreated) ?? 0)) {
            adminRatings.set(tripId, { id: ratingDoc.id, ...rating });
          }
        }
      }
    }

    const ratings = orders
      .map((order) => {
        const adminRating = adminRatings.get(order.id);
        const rating = Number(adminRating?.rating ?? adminRating?.driverRating ?? order.driverRating ?? 0);
        if (!Number.isFinite(rating) || rating <= 0) return null;
        return {
          id: String(adminRating?.id ?? order.id),
          orderNumber: String(order.orderNumber || order.orderCode || order.id.slice(0, 8).toUpperCase()),
          customerName: String(order.customerName || "Customer"),
          driverName: String(order.driverName || "Driver"),
          rating,
          comment: String(adminRating?.comment || order.driverRatingComment || ""),
          ratedAtSeconds: timestampSeconds(
            adminRating?.dateCreated || order.ratingDate || order.deliveredAt || order.updatedAt || order.createdAt,
          ),
        };
      })
      .filter((rating): rating is NonNullable<typeof rating> => rating !== null)
      .sort((a, b) => (b.ratedAtSeconds ?? 0) - (a.ratedAtSeconds ?? 0));

    return NextResponse.json({ ok: true, ratings });
  } catch (error) {
    console.error("[business/trip-ratings]", error);
    return NextResponse.json({ ok: false, error: "Could not load trip ratings" }, { status: 500 });
  }
}
