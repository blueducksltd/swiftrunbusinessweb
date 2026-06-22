"use client";

import { useState, useEffect } from "react";
import { subscribeToShop, updateShopProfile } from "@/lib/firestore";
import { getShopId } from "@/lib/session";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type DayHours = { open: string; close: string; closed: boolean };
type Hours = Record<string, DayHours>;

const DEFAULT_HOURS: Hours = Object.fromEntries(
  DAYS.map((d) => [d, { open: "09:00", close: "21:00", closed: d === "Sunday" }])
);

export default function BusinessPage() {
  const [form, setForm] = useState({
    name: "",
    description: "",
    address: "",
    latitude: 0,
    longitude: 0,
    phone: "",
    bannerUrl: "",
    logoUrl: "",
  });
  const [hours, setHours] = useState<Hours>(DEFAULT_HOURS);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const shopId = getShopId();
    if (!shopId) return;
    const unsub = subscribeToShop(shopId, (shop) => {
      if (!shop) return;
      setForm({
        name: shop.name ?? "",
        description: shop.description ?? "",
        address: shop.address ?? "",
        latitude: shop.latitude ?? 0,
        longitude: shop.longitude ?? 0,
        phone: shop.phone ?? "",
        bannerUrl: shop.bannerUrl ?? "",
        logoUrl: shop.logoUrl ?? "",
      });
      if (shop.openingHours && Object.keys(shop.openingHours).length > 0) {
        setHours((prev) => ({ ...prev, ...shop.openingHours }));
      }
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const shopId = getShopId();
    if (!shopId) return;
    setSaving(true);
    setSaveError("");
    try {
      await updateShopProfile(shopId, {
        name: form.name,
        description: form.description,
        phone: form.phone,
        openingHours: hours,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save business profile");
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day: string) {
    setHours((p) => ({ ...p, [day]: { ...p[day], closed: !p[day].closed } }));
  }

  function updateHours(day: string, field: "open" | "close", value: string) {
    setHours((p) => ({ ...p, [day]: { ...p[day], [field]: value } }));
  }

  return (
    <form onSubmit={handleSave}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">Business Profile</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your store details and visibility</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm font-bold text-green-600 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Saved!
            </span>
          )}
          {saveError && (
            <span className="text-sm font-bold text-red-600">{saveError}</span>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !loaded}
            className="h-9 px-5 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {saving ? "Saving…" : "Update Profile"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        {/* Left column */}
        <div className="space-y-5">
          {/* Banner + Logo */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="relative">
              {/* Banner */}
              <div className="h-36 relative">
                {form.bannerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.bannerUrl} alt="Store banner" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-slate-700 to-slate-900 flex items-center justify-center">
                    <p className="text-xs text-slate-400 font-semibold">No banner image set</p>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/20" />
              </div>

              {/* Logo circle */}
              <div className="absolute -bottom-8 left-5">
                <div className="size-16 rounded-full border-4 border-white bg-white shadow-md overflow-hidden">
                  {form.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logoUrl} alt="Store logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Name below banner */}
            <div className="pt-11 pb-4 px-5">
              <p className="font-black text-slate-900">{form.name || "Your Store"}</p>
              <p className="text-xs text-slate-400 mt-0.5">Banner and logo are set from the SwiftRun admin panel</p>
            </div>
          </div>

          {/* Business info */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h2 className="font-black text-slate-900 text-sm">Business Information</h2>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Business Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Address</label>
              <div className="relative">
                <input
                  type="text"
                  value={form.address}
                  readOnly
                  placeholder="No address set"
                  className="w-full h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 pr-10 text-sm text-slate-600 outline-none cursor-not-allowed"
                />
                <div className="absolute right-3 top-2.5 text-slate-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                {form.latitude && form.longitude
                  ? `Pinned at ${form.latitude.toFixed(5)}, ${form.longitude.toFixed(5)}. `
                  : ""}Address and map pin are managed by the SwiftRun team. Contact Support to change them.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
              />
            </div>
          </div>

        </div>

        {/* Right column — Opening Hours */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-black text-slate-900 text-sm mb-4">Opening Hours</h2>
          <div className="space-y-3">
            {DAYS.map((day) => {
              const h = hours[day];
              return (
                <div key={day} className="flex items-center gap-3">
                  <div className="w-24 shrink-0">
                    <p className="text-xs font-bold text-slate-700">{day.slice(0, 3)}</p>
                  </div>
                  {h.closed ? (
                    <p className="flex-1 text-xs text-slate-400 font-semibold">Closed</p>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="time"
                        value={h.open}
                        onChange={(e) => updateHours(day, "open", e.target.value)}
                        className="h-8 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-[#056abf] flex-1"
                      />
                      <span className="text-xs text-slate-400">to</span>
                      <input
                        type="time"
                        value={h.close}
                        onChange={(e) => updateHours(day, "close", e.target.value)}
                        className="h-8 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-[#056abf] flex-1"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`h-7 w-12 rounded-full transition-colors shrink-0 relative ${
                      h.closed ? "bg-slate-200" : "bg-[#056abf]"
                    }`}
                  >
                    <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow-sm transition-all ${
                      h.closed ? "left-0.5" : "left-5"
                    }`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </form>
  );
}
