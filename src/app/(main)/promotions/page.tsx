"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { getShopId, getRole } from "@/lib/session";
import {
  adsAvailableForShop,
  setAdPaused,
  subscribeToAdsConfig,
  subscribeToMyAds,
  subscribeToProducts,
  subscribeToShop,
  uploadProductImage,
  type AdsConfig,
  type AdStatus,
  type BusinessAd,
  type Product,
  type ShopProfile,
} from "@/lib/firestore";

const DURATIONS = [1, 3, 7, 14, 30];

const STATUS_STYLES: Record<AdStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending_review: "bg-amber-50 text-amber-700",
  active: "bg-green-50 text-green-700",
  paused: "bg-slate-100 text-slate-600",
  rejected: "bg-red-50 text-red-700",
  expired: "bg-slate-50 text-slate-400",
};

function fmtCost(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

export default function PromotionsPage() {
  const shopId = getShopId() ?? "";
  const isOwner = getRole() === "owner";

  const [cfg, setCfg] = useState<AdsConfig | null>(null);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [ads, setAds] = useState<BusinessAd[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [targetType, setTargetType] = useState<"product" | "store">("product");
  const [productId, setProductId] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [days, setDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shopId) return;
    const u1 = subscribeToAdsConfig((c) => { setCfg(c); setCfgLoaded(true); });
    const u2 = subscribeToShop(shopId, setShop);
    const u3 = subscribeToMyAds(shopId, setAds);
    const u4 = subscribeToProducts(shopId, setProducts);
    return () => { u1(); u2(); u3(); u4(); };
  }, [shopId]);

  const countryCode = (shop?.countryCode ?? shop?.isoCode ?? "").toUpperCase();
  const available = adsAvailableForShop(cfg, countryCode);
  const pricing = cfg?.pricing[countryCode];

  const cost = useMemo(() => {
    if (!pricing) return null;
    const weeks = Math.floor(days / 7);
    const rest = days % 7;
    return weeks * pricing.weekly + rest * pricing.daily;
  }, [pricing, days]);

  const slotsUsed = ads.filter((a) =>
    ["pending_review", "active", "paused"].includes(a.status)
  ).length;
  const slotsFull = cfg ? slotsUsed >= cfg.maxAdsPerBusiness : true;

  async function handleCreate() {
    if (!cfg || !pricing || submitting) return;
    setError("");
    if (targetType === "product" && !productId) {
      setError("Pick the product you are advertising.");
      return;
    }
    if (!title.trim()) {
      setError("Give the ad a title.");
      return;
    }
    setSubmitting(true);
    try {
      let bannerUrl = "";
      if (bannerFile) {
        bannerUrl = await uploadProductImage(shopId, bannerFile);
      }
      const res = await fetch("/api/ads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId, targetType, productId: targetType === "product" ? productId : "",
          title: title.trim(), subtitle: subtitle.trim(), bannerUrl, days,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.reason ?? "Could not create the ad.");
        return;
      }
      setCreateOpen(false);
      setTitle(""); setSubtitle(""); setBannerFile(null); setProductId(""); setDays(7);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOwner) {
    return <p className="text-sm font-semibold text-slate-500 p-2">Only the store owner can manage promotions.</p>;
  }

  // Layer 2 of the protection: even with a bookmarked URL, the page refuses
  // service while the admin has ads disabled for this region.
  if (cfgLoaded && !available) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-lg font-black text-slate-900 mb-2">Promotions are currently unavailable</h1>
        <p className="text-sm text-slate-500">
          Sponsored ads are not active for your region right now. Check back later.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">Promotions</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {cfg ? `${slotsUsed}/${cfg.maxAdsPerBusiness} ad slot${cfg.maxAdsPerBusiness === 1 ? "" : "s"} in use` : "Loading…"}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          disabled={slotsFull}
          className="h-9 px-5 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={slotsFull ? "All your ad slots are in use" : ""}
        >
          + Place Ad
        </button>
      </div>

      {pricing && (
        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm font-semibold text-blue-800">
          Rates for your region: {fmtCost(pricing.daily, pricing.currency)}/day ·{" "}
          {fmtCost(pricing.weekly, pricing.currency)}/week. Fees are deducted from your sales payout balance.
        </div>
      )}

      {/* Ad history — every ad ever placed stays visible with its outcome */}
      <div className="space-y-3">
        {ads.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No ads yet. Place your first ad to appear in the customer app&apos;s home banner.
          </div>
        )}
        {ads.map((ad) => {
          const adminPaused = ad.status === "paused" && ad.pausedBy === "admin";
          return (
            <div key={ad.id} className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-4">
              {ad.bannerUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={ad.bannerUrl} alt="" className="h-14 w-28 rounded-lg object-cover border border-slate-100" />
              ) : ad.productImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={ad.productImageUrl} alt="" className="h-14 w-14 rounded-lg object-cover border border-slate-100" />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-slate-100" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-black text-slate-900 truncate">{ad.title}</p>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_STYLES[ad.status] ?? "bg-slate-100")}>
                    {ad.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ad.targetType === "product" ? "Product ad" : "Store ad"} · {ad.days} day{ad.days === 1 ? "" : "s"} ·{" "}
                  {fmtCost(ad.amount, ad.currency)}
                  {ad.endsAt ? ` · ends ${ad.endsAt.toDate().toLocaleDateString()}` : ""}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {ad.impressions ?? 0} views · {ad.clicks ?? 0} clicks
                  {ad.status === "rejected" && ad.rejectReason ? ` · Rejected: ${ad.rejectReason}` : ""}
                  {adminPaused ? " · Paused by SwiftRun" : ""}
                </p>
              </div>
              {(ad.status === "active" || (ad.status === "paused" && !adminPaused)) && (
                <button
                  onClick={() => setAdPaused(ad.id, ad.status === "active")}
                  className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  {ad.status === "active" ? "Pause" : "Resume"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Ad Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-black text-slate-900">Place an Ad</h2>
              <button onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">What are you advertising?</label>
                <div className="flex gap-2">
                  {(["product", "store"] as const).map((t) => (
                    <button
                      key={t} type="button"
                      onClick={() => setTargetType(t)}
                      className={cn(
                        "flex-1 h-10 rounded-lg border text-sm font-bold transition-colors",
                        targetType === t
                          ? "border-[#056abf] bg-blue-50 text-[#056abf]"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {t === "product" ? "A product" : "My store"}
                    </button>
                  ))}
                </div>
              </div>

              {targetType === "product" && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Product</label>
                  <select
                    value={productId}
                    onChange={(e) => {
                      setProductId(e.target.value);
                      const p = products.find((x) => x.id === e.target.value);
                      if (p && !title.trim()) setTitle(p.name);
                    }}
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] cursor-pointer"
                  >
                    <option value="">-- Choose product --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Ad title</label>
                <input
                  value={title} onChange={(e) => setTitle(e.target.value)} maxLength={50}
                  placeholder="e.g. 20% off all wash & fold this week"
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Short subtitle (optional)</label>
                <input
                  value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={70}
                  placeholder="One line shown under the title"
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Banner image (optional)</label>
                <input
                  type="file" accept="image/*"
                  onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
                <p className="mt-1 text-[11px] font-semibold text-slate-400">
                  Recommended 1200×450. Without an image we compose the banner from your
                  {targetType === "product" ? " product photo" : " store logo"} automatically.
                  {cfg?.requiresApproval ? " Uploaded banners are reviewed before going live." : ""}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Duration</label>
                <div className="flex gap-2 flex-wrap">
                  {DURATIONS.map((d) => (
                    <button
                      key={d} type="button" onClick={() => setDays(d)}
                      className={cn(
                        "h-9 px-4 rounded-lg border text-sm font-bold transition-colors",
                        days === d
                          ? "border-[#056abf] bg-blue-50 text-[#056abf]"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {d === 1 ? "1 day" : d === 7 ? "1 week" : d === 14 ? "2 weeks" : d === 30 ? "30 days" : `${d} days`}
                    </button>
                  ))}
                </div>
              </div>

              {pricing && cost !== null && (
                <div className="rounded-xl bg-slate-50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-600">Total — deducted from payouts</span>
                  <span className="text-lg font-black text-slate-900">{fmtCost(cost, pricing.currency)}</span>
                </div>
              )}

              {error && <p className="text-sm font-bold text-red-600">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => setCreateOpen(false)}
                  className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={submitting}
                  className="flex-1 h-10 rounded-lg bg-[#056abf] text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? "Placing…" : "Place Ad"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
