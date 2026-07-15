"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { getShopId, getRole } from "@/lib/session";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  adsAvailableForShop,
  deleteAd,
  setAdPaused,
  updateAdText,
  subscribeToAdsConfig,
  subscribeToMyAds,
  subscribeToProducts,
  subscribeToShop,
  uploadProductImage,
  validateBusinessImageFile,
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

const AD_STATUSES: AdStatus[] = ["draft", "pending_review", "active", "paused", "rejected", "expired"];

function fmtCost(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function timeLeft(endsAt: { toDate?: () => Date } | null | undefined): string {
  const end = endsAt?.toDate?.();
  if (!end) return "";
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return "ended";
  const days = Math.floor(ms / 86_400_000);
  const hrs = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days >= 1) return `${days}d ${hrs}h left`;
  if (hrs >= 1) return `${hrs}h ${mins}m left`;
  return `${mins}m left`;
}

function expiryLabel(endsAt: { toDate?: () => Date } | null | undefined): string {
  const end = endsAt?.toDate?.();
  if (!end) return "";
  return end.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

export default function PromotionsPage() {
  const searchParams = useSearchParams();
  const shopId = getShopId() ?? "";
  const isOwner = getRole() === "owner";

  const [cfg, setCfg] = useState<AdsConfig | null>(null);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [ads, setAds] = useState<BusinessAd[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [fin, setFin] = useState<{ withdrawable: number } | null>(null);
  const [notice, setNotice] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [targetType, setTargetType] = useState<"product" | "store">("product");
  const [productId, setProductId] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerError, setBannerError] = useState("");
  const [days, setDays] = useState(7);
  const [payMethod, setPayMethod] = useState<"balance" | "card">("balance");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editAd, setEditAd] = useState<BusinessAd | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busyAd, setBusyAd] = useState(false);
  const [continueAd, setContinueAd] = useState<BusinessAd | null>(null);
  const [continueDays, setContinueDays] = useState(7);
  const [continuePayMethod, setContinuePayMethod] = useState<"balance" | "card">("balance");
  const [continueError, setContinueError] = useState("");
  const [continueSubmitting, setContinueSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AdStatus | "all">("all");

  async function saveEdit() {
    if (!editAd || busyAd) return;
    setBusyAd(true);
    try {
      await updateAdText(editAd.id, editTitle, editSubtitle);
      setEditAd(null);
    } finally {
      setBusyAd(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId || busyAd) return;
    setBusyAd(true);
    try {
      await deleteAd(deleteId);
      setDeleteId(null);
    } finally {
      setBusyAd(false);
    }
  }

  async function payToContinue() {
    if (!continueAd || continueSubmitting) return;
    setContinueError("");
    if (continuePayMethod === "card" && !cfg?.payWithCard) {
      setContinueError("Card payment is not available for promotions right now.");
      return;
    }
    if (continuePayMethod === "balance" && !cfg?.payWithBalance) {
      setContinueError("Store balance payment is not available for promotions right now.");
      return;
    }
    setContinueSubmitting(true);
    try {
      if (continuePayMethod === "balance") {
        const res = await authenticatedFetch("/api/ads/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId,
            resumeAdId: continueAd.id,
            title: continueAd.title,
            days: continueDays,
            countryCode,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          setContinueError(data.reason ?? "Could not continue this promotion.");
          return;
        }
        setNotice("Payment received. Your promotion is live again.");
        setContinueAd(null);
        return;
      }

      const res = await authenticatedFetch("/api/ads/pay-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          resumeAdId: continueAd.id,
          title: continueAd.title,
          days: continueDays,
          paymentMethod: "card",
          email: shop?.email ?? shop?.ownerEmail ?? "",
        }),
      });
      const data = await res.json();
      if (!data.ok || !data.url) {
        setContinueError(data.reason ?? "Could not start payment.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setContinueError("Could not start payment. Please try again.");
    } finally {
      setContinueSubmitting(false);
    }
  }

  useEffect(() => {
    if (!shopId) return;
    const u1 = subscribeToAdsConfig((c) => { setCfg(c); setCfgLoaded(true); });
    const u2 = subscribeToShop(shopId, setShop);
    const u3 = subscribeToMyAds(shopId, setAds);
    const u4 = subscribeToProducts(shopId, setProducts);
    authenticatedFetch(`/api/business/financial-status?shop_id=${encodeURIComponent(shopId)}`)
      .then((r) => r.json())
      .then((d) => { if (d?.found) setFin(d); })
      .catch(() => {});
    return () => { u1(); u2(); u3(); u4(); };
  }, [shopId]);

  // Default the payment method to whichever the admin has enabled.
  useEffect(() => {
    if (!cfg) return;
    if (payMethod === "balance" && !cfg.payWithBalance && cfg.payWithCard) setPayMethod("card");
    if (payMethod === "card" && !cfg.payWithCard && cfg.payWithBalance) setPayMethod("balance");
    if (continuePayMethod === "balance" && !cfg.payWithBalance && cfg.payWithCard) setContinuePayMethod("card");
    if (continuePayMethod === "card" && !cfg.payWithCard && cfg.payWithBalance) setContinuePayMethod("balance");
  }, [cfg, payMethod, continuePayMethod]);

  // Returning from a card-payment gateway: verify and finalize the ad.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ad_cancel")) {
      setNotice("Payment cancelled — your ad was not created.");
      window.history.replaceState({}, "", "/promotions");
      return;
    }
    const ref = params.get("ad_ref");
    if (!ref) return;
    const sessionId = params.get("session_id") ?? "";
    authenticatedFetch("/api/ads/pay-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, reference: ref, session_id: sessionId }),
    })
      .then((r) => r.json())
      .then((d) => setNotice(d.ok
        ? "Payment received — your ad is now live."
        : (d.reason ?? "We could not confirm your payment.")))
      .catch(() => setNotice("We could not confirm your payment."))
      .finally(() => window.history.replaceState({}, "", "/promotions"));
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
  const continueCost = useMemo(() => {
    if (!pricing) return null;
    const weeks = Math.floor(continueDays / 7);
    const rest = continueDays % 7;
    return weeks * pricing.weekly + rest * pricing.daily;
  }, [pricing, continueDays]);
  // Live preview: uploaded image wins, else the product photo (product ads),
  // else the brand gradient — exactly how the customer app renders it.
  const bannerPreviewUrl = useMemo(
    () => (bannerFile ? URL.createObjectURL(bannerFile) : ""),
    [bannerFile],
  );
  useEffect(
    () => () => { if (bannerPreviewUrl) URL.revokeObjectURL(bannerPreviewUrl); },
    [bannerPreviewUrl],
  );
  const selectedProduct = products.find((p) => p.id === productId);
  const previewImage =
    bannerPreviewUrl || (targetType === "product" ? selectedProduct?.imageUrl ?? "" : "");

  function handleBannerSelect(file: File | null) {
    setBannerError("");
    if (!file) {
      setBannerFile(null);
      return;
    }
    try {
      validateBusinessImageFile(file);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Please upload a JPG, PNG, or WEBP image.");
      setBannerFile(null);
      return;
    }
    setBannerFile(file);
  }

  const slotsUsed = ads.filter((a) =>
    ["pending_review", "active", "paused"].includes(a.status)
  ).length;
  const slotsFull = cfg ? slotsUsed >= cfg.maxAdsPerBusiness : true;
  const searchTerm = (searchParams.get("q") ?? "").trim().toLowerCase();
  const filteredAds = ads.filter((ad) => {
    if (statusFilter !== "all" && ad.status !== statusFilter) return false;
    if (!searchTerm) return true;
    return [
      ad.title,
      ad.subtitle,
      ad.status,
      ad.targetType,
      ad.currency,
      ad.amount,
      ad.rejectReason,
      ad.days,
    ].some((value) => String(value ?? "").toLowerCase().includes(searchTerm));
  });

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
      const adBody = {
        shopId, targetType, productId: targetType === "product" ? productId : "",
        title: title.trim(), subtitle: subtitle.trim(), bannerUrl, days,
        paymentMethod: payMethod,
      };

      if (payMethod === "card") {
        // Card: get a gateway checkout URL from Django and hand off. The ad
        // is created only after the payment verifies on return.
        const res = await authenticatedFetch("/api/ads/pay-init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...adBody, email: shop?.email ?? shop?.ownerEmail ?? "" }),
        });
        const data = await res.json();
        if (!data.ok || !data.url) {
          setError(data.reason ?? "Could not start card payment.");
          return;
        }
        window.location.href = data.url; // off to Paystack/Stripe
        return;
      }

      const res = await authenticatedFetch("/api/ads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adBody),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.reason ?? "Could not create the ad.");
        return;
      }
      setCreateOpen(false);
      setTitle(""); setSubtitle(""); setBannerFile(null); setBannerError(""); setProductId(""); setDays(7);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The image upload failed. Please check your connection and try again.");
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
      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm font-semibold text-blue-800">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} className="text-blue-400 hover:text-blue-600">✕</button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">Promotions</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {cfg ? `${slotsUsed}/${cfg.maxAdsPerBusiness} ad slot${cfg.maxAdsPerBusiness === 1 ? "" : "s"} in use` : "Loading…"}
            {searchTerm ? ` · ${filteredAds.length} matching "${searchParams.get("q")}"` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AdStatus | "all")}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 outline-none focus:border-[#056abf] cursor-pointer"
          >
            <option value="all">All statuses</option>
            {AD_STATUSES.map((status) => (
              <option key={status} value={status}>{status.replace("_", " ")}</option>
            ))}
          </select>
          <button
            onClick={() => setCreateOpen(true)}
            disabled={slotsFull}
            className="h-9 px-5 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={slotsFull ? "All your ad slots are in use" : ""}
          >
            + Place Ad
          </button>
        </div>
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
        {ads.length > 0 && filteredAds.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No matching promotions. Try another search or adjust the status filter.
          </div>
        )}
        {filteredAds.map((ad) => {
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
                </p>
                {(ad.status === "active" || ad.status === "paused") && ad.endsAt && (
                  <p className="text-xs font-semibold text-[#056abf] mt-0.5">
                    {ad.status === "active" ? `${timeLeft(ad.endsAt)} · ` : ""}expires {expiryLabel(ad.endsAt)}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">
                  {ad.impressions ?? 0} views · {ad.clicks ?? 0} clicks
                  {ad.status === "rejected" && ad.rejectReason ? ` · Rejected: ${ad.rejectReason}` : ""}
                  {adminPaused ? " · Paused by SwiftRun" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {adminPaused && (
                  <div className="max-w-xs rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
                    Paused by SwiftRun. Contact support to review this ad.
                  </div>
                )}
                {ad.status === "expired" && (
                  <button
                    onClick={() => {
                      setContinueAd(ad);
                      setContinueDays(ad.days && DURATIONS.includes(ad.days) ? ad.days : 7);
                      setContinuePayMethod(cfg?.payWithBalance ? "balance" : "card");
                      setContinueError("");
                    }}
                    className="h-9 px-4 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors"
                  >
                    Pay to continue
                  </button>
                )}
                {(ad.status === "active" || (ad.status === "paused" && !adminPaused)) && (
                  <button
                    onClick={() => setAdPaused(ad.id, ad.status === "active")}
                    className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    {ad.status === "active" ? "Pause" : "Resume"}
                  </button>
                )}
                {ad.status !== "rejected" && ad.status !== "expired" && (
                  <button
                    onClick={() => { setEditAd(ad); setEditTitle(ad.title); setEditSubtitle(ad.subtitle ?? ""); }}
                    className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => setDeleteId(ad.id)}
                  className="h-9 px-4 rounded-lg border border-red-200 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Continue Expired Ad Modal */}
      {continueAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-black text-slate-900">Continue promotion</h2>
              <button onClick={() => setContinueAd(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-sm font-bold text-blue-900">{continueAd.title}</p>
                <p className="mt-1 text-xs font-semibold text-blue-800">
                  This ad has expired. Choose a new paid run to put it live again.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">New duration</label>
                <div className="flex gap-2 flex-wrap">
                  {DURATIONS.map((d) => (
                    <button
                      key={d} type="button" onClick={() => setContinueDays(d)}
                      className={cn(
                        "h-9 px-4 rounded-lg border text-sm font-bold transition-colors",
                        continueDays === d
                          ? "border-[#056abf] bg-blue-50 text-[#056abf]"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {d === 1 ? "1 day" : d === 7 ? "1 week" : d === 14 ? "2 weeks" : d === 30 ? "30 days" : `${d} days`}
                    </button>
                  ))}
                </div>
              </div>

              {pricing && continueCost !== null && (
                <div className="rounded-xl bg-slate-50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-600">
                    Total {continuePayMethod === "card" ? "charged to card" : "deducted from balance"}
                  </span>
                  <span className="text-lg font-black text-slate-900">{fmtCost(continueCost, pricing.currency)}</span>
                </div>
              )}

              {cfg && (cfg.payWithBalance || cfg.payWithCard) && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Payment method</label>
                  <div className="flex gap-2">
                    {cfg.payWithBalance && (
                      <button
                        type="button" onClick={() => setContinuePayMethod("balance")}
                        className={cn(
                          "flex-1 h-10 rounded-lg border text-sm font-bold transition-colors",
                          continuePayMethod === "balance"
                            ? "border-[#056abf] bg-blue-50 text-[#056abf]"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        Store balance
                      </button>
                    )}
                    {cfg.payWithCard && (
                      <button
                        type="button" onClick={() => setContinuePayMethod("card")}
                        className={cn(
                          "flex-1 h-10 rounded-lg border text-sm font-bold transition-colors",
                          continuePayMethod === "card"
                            ? "border-[#056abf] bg-blue-50 text-[#056abf]"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        Card
                      </button>
                    )}
                  </div>
                  {fin && continuePayMethod === "balance" && (
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      Available balance: {fmtCost(fin.withdrawable, pricing?.currency ?? "")}
                    </p>
                  )}
                </div>
              )}
              {!cfg?.payWithBalance && !cfg?.payWithCard && (
                <p className="text-sm font-bold text-red-600">Promotion payments are not enabled right now.</p>
              )}
              {continueError && <p className="text-sm font-bold text-red-600">{continueError}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => setContinueAd(null)}
                  className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={payToContinue}
                  disabled={continueSubmitting || (!cfg?.payWithBalance && !cfg?.payWithCard)}
                  className="flex-1 h-10 rounded-lg bg-[#056abf] text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60"
                >
                  {continueSubmitting ? "Starting..." : "Pay to continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Ad Modal */}
      {editAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-black text-slate-900">Edit Ad</h2>
              <button onClick={() => setEditAd(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Ad title</label>
                <input
                  value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={50}
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Short subtitle</label>
                <input
                  value={editSubtitle} onChange={(e) => setEditSubtitle(e.target.value)} maxLength={70}
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf]"
                />
              </div>
              <p className="text-[11px] font-semibold text-slate-400">
                Only the text can be edited. To change the image, duration or product, place a new ad.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setEditAd(null)} className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={saveEdit} disabled={busyAd || !editTitle.trim()} className="flex-1 h-10 rounded-lg bg-[#056abf] text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60">
                  {busyAd ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm text-center p-8">
            <h3 className="text-lg font-black text-slate-900 mb-2">Delete this ad?</h3>
            <p className="text-slate-500 text-sm mb-6">
              This removes the ad and frees your ad slot. Any fee already paid is not refunded.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={confirmDelete} disabled={busyAd} className="flex-1 h-10 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-60">
                {busyAd ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Preview</label>
                <div
                  className="relative w-full overflow-hidden rounded-xl border border-slate-200"
                  style={{
                    aspectRatio: "16 / 6",
                    backgroundImage: previewImage
                      ? `url(${previewImage})`
                      : "linear-gradient(135deg, #134E8F, #0E7490)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  {/* scrim */}
                  <div className="absolute inset-0" style={{
                    background: "linear-gradient(90deg, rgba(0,0,0,0.6), rgba(0,0,0,0.15))",
                  }} />
                  <span className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Sponsored
                  </span>
                  <div className="absolute left-3 top-3 right-3">
                    <p className="text-sm font-black leading-tight text-white line-clamp-2">
                      {title || "Your ad title"}
                    </p>
                    {subtitle && (
                      <p className="mt-0.5 text-xs text-white/90 line-clamp-1">{subtitle}</p>
                    )}
                  </div>
                  <div className="absolute bottom-2 left-3 right-3 flex items-center gap-1.5">
                    {shop?.logoUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={shop.logoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                    )}
                    <span className="text-xs font-bold text-white line-clamp-1">{shop?.name ?? ""}</span>
                  </div>
                </div>
                <p className="mt-1 text-[11px] font-semibold text-slate-400">
                  This is how your ad appears in the app. {previewImage ? "" : (
                    targetType === "product"
                      ? "Pick a product to use its photo, or upload your own banner below."
                      : "Upload a banner below, or it shows your store branding."
                  )}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Banner image (optional)</label>
                <input
                  type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={(e) => handleBannerSelect(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
                {bannerError && (
                  <p className="mt-1 text-[11px] font-bold text-red-600">{bannerError}</p>
                )}
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

              {cfg && (cfg.payWithBalance || cfg.payWithCard) && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Payment method</label>
                  <div className="flex gap-2">
                    {cfg.payWithBalance && (
                      <button
                        type="button" onClick={() => setPayMethod("balance")}
                        className={cn(
                          "flex-1 h-10 rounded-lg border text-sm font-bold transition-colors",
                          payMethod === "balance"
                            ? "border-[#056abf] bg-blue-50 text-[#056abf]"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        Store balance
                      </button>
                    )}
                    {cfg.payWithCard && (
                      <button
                        type="button" onClick={() => setPayMethod("card")}
                        className={cn(
                          "flex-1 h-10 rounded-lg border text-sm font-bold transition-colors",
                          payMethod === "card"
                            ? "border-[#056abf] bg-blue-50 text-[#056abf]"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        Card
                      </button>
                    )}
                  </div>
                  {fin && payMethod === "balance" && (
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      Available balance: {fmtCost(fin.withdrawable, pricing?.currency ?? "")}
                    </p>
                  )}
                </div>
              )}

              {pricing && cost !== null && (
                <div className="rounded-xl bg-slate-50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-600">
                    Total — {payMethod === "card" ? "charged to card" : "deducted from balance"}
                  </span>
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
