import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const DJANGO_BASE_URL = "https://api.swiftrunapp.com";

/**
 * The only writer of BusinessAds documents. Validates everything server-side
 * (feature enabled, region allowed, ownership, caps, pricing) and records the
 * charge in Django before the ad exists, so a tampered client cannot create
 * ads the admin's settings forbid or that were never billed.
 */
export async function POST(req: NextRequest) {
  try {
    const { shopId, targetType, productId, title, subtitle, bannerUrl, days, paymentMethod } =
      await req.json() as {
        shopId: string; targetType: "product" | "store"; productId?: string;
        title: string; subtitle?: string; bannerUrl?: string; days: number;
        paymentMethod?: "balance" | "card";
      };
    const payMethod = paymentMethod === "card" ? "card" : "balance";

    if (!shopId || !title?.trim() || !days || days < 1 || days > 90) {
      return NextResponse.json({ ok: false, reason: "Missing or invalid fields" }, { status: 400 });
    }

    const db = adminDb();

    // 1. Feature switch + region + pricing
    const cfgSnap = await db.collection("AdsConfig").doc("config").get();
    const cfg = cfgSnap.data();
    if (!cfg?.enabled) {
      return NextResponse.json({ ok: false, reason: "Promotions are currently unavailable." }, { status: 403 });
    }

    const shopSnap = await db.collection("Shops").doc(shopId).get();
    if (!shopSnap.exists) {
      return NextResponse.json({ ok: false, reason: "Shop not found" }, { status: 404 });
    }
    const shop = shopSnap.data()!;
    const cc = String(shop.countryCode ?? shop.isoCode ?? "").toUpperCase();
    const activeCountries: string[] = cfg.activeCountries ?? [];
    if (!cc || (activeCountries.length && !activeCountries.includes(cc))) {
      return NextResponse.json({ ok: false, reason: "Promotions are not available in your region." }, { status: 403 });
    }
    const pricing = (cfg.pricing ?? {})[cc];
    if (!pricing) {
      return NextResponse.json({ ok: false, reason: "No ad pricing configured for your region yet." }, { status: 403 });
    }

    // 2. Target ownership
    let productImageUrl = "";
    if (targetType === "product") {
      if (!productId) {
        return NextResponse.json({ ok: false, reason: "Product is required" }, { status: 400 });
      }
      const prodSnap = await db.collection("Products").doc(productId).get();
      const prod = prodSnap.data();
      if (!prodSnap.exists || prod?.shopId !== shopId) {
        return NextResponse.json({ ok: false, reason: "That product does not belong to your store." }, { status: 403 });
      }
      productImageUrl = prod?.imageUrl ?? "";
    }

    // 3. Caps
    const mineSnap = await db.collection("BusinessAds")
      .where("shopId", "==", shopId)
      .where("status", "in", ["pending_review", "active", "paused"]).get();
    if (mineSnap.size >= (cfg.maxAdsPerBusiness ?? 1)) {
      return NextResponse.json({ ok: false, reason: "All your ad slots are already in use." }, { status: 403 });
    }
    const activeSnap = await db.collection("BusinessAds")
      .where("status", "==", "active").get();
    if (activeSnap.size >= (cfg.maxActiveAds ?? 10)) {
      return NextResponse.json({ ok: false, reason: "Ad space is fully booked right now. Try again later." }, { status: 403 });
    }

    // 4. Bill first, exist second. Django recomputes the price from its own
    //    pricing table, so the amount cannot be tampered with from here.
    const adRef = db.collection("BusinessAds").doc();
    const chargeRes = await fetch(`${DJANGO_BASE_URL}/api/ads/charge/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, adId: adRef.id, days, countryCode: cc, title: title.trim(), paymentMethod: payMethod }),
    });
    const charge = await chargeRes.json().catch(() => ({ ok: false }));
    if (!chargeRes.ok || !charge.ok) {
      return NextResponse.json(
        { ok: false, reason: charge.reason ?? "Billing failed — the ad was not created." },
        { status: 402 });
    }

    // 5. Create the ad
    const requiresApproval = cfg.requiresApproval !== false;
    const status = bannerUrl && requiresApproval ? "pending_review" : "active";
    await adRef.set({
      shopId,
      shopName: shop.name ?? "",
      countryCode: cc,
      state: shop.state ?? "",
      targetType: targetType === "store" ? "store" : "product",
      productId: targetType === "product" ? productId : "",
      productImageUrl,
      shopLogoUrl: shop.logoUrl ?? "",
      title: title.trim(),
      subtitle: (subtitle ?? "").trim(),
      bannerUrl: bannerUrl ?? "",
      status,
      businessEnabled: true,
      pausedBy: "",
      days,
      amount: charge.amount,
      currency: charge.currency,
      startsAt: Timestamp.now(),
      endsAt: Timestamp.fromMillis(Date.now() + days * 86400_000),
      impressions: 0,
      clicks: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, status, amount: charge.amount, currency: charge.currency });
  } catch (err) {
    console.error("ads/create failed:", err);
    return NextResponse.json({ ok: false, reason: "Server error" }, { status: 500 });
  }
}
