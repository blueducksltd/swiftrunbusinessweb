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
    phone: "",
    serviceCharge: "5",
    deliveryFee: "500",
  });
  const [hours, setHours] = useState<Hours>(DEFAULT_HOURS);
  const [saved, setSaved] = useState(false);
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
        phone: shop.phone ?? "",
        serviceCharge: String(shop.serviceChargePct ?? 5),
        deliveryFee: String(shop.deliveryFee ?? 500),
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
    try {
      await updateShopProfile(shopId, {
        name: form.name,
        description: form.description,
        address: form.address,
        phone: form.phone,
        serviceChargePct: parseFloat(form.serviceCharge) || 0,
        deliveryFee: parseFloat(form.deliveryFee) || 0,
        openingHours: hours,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
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
          {/* Banner */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="h-36 bg-gradient-to-r from-slate-700 to-slate-900 relative flex items-center justify-center">
              <div className="text-center">
                <p className="text-2xl font-black text-white">{form.name || "Your Store"}</p>
                <p className="text-xs text-slate-300 mt-1">Store Banner</p>
              </div>
              <button
                type="button"
                className="absolute bottom-3 right-3 h-8 px-3 rounded-lg bg-white/20 text-white text-xs font-bold hover:bg-white/30 transition-colors backdrop-blur-sm"
              >
                Change Image
              </button>
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
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
              />
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

          {/* Charges */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h2 className="font-black text-slate-900 text-sm">Charges &amp; Fees</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Service Charge (%)</label>
                <input
                  type="number"
                  value={form.serviceCharge}
                  onChange={(e) => setForm((p) => ({ ...p, serviceCharge: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Delivery Fee (₦)</label>
                <input
                  type="number"
                  value={form.deliveryFee}
                  onChange={(e) => setForm((p) => ({ ...p, deliveryFee: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                />
              </div>
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
