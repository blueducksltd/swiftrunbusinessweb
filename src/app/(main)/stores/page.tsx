"use client";

import { useState } from "react";

const topStats = [
  { label: "Total Orders", value: "1,958", color: "text-slate-900", bg: "bg-white" },
  { label: "Completed", value: "1,000", color: "text-green-600", bg: "bg-white" },
  { label: "Pending", value: "1,074", color: "text-[#056abf]", bg: "bg-white" },
  { label: "Cancelled", value: "0083", color: "text-red-500", bg: "bg-white" },
];

const revenueStats = [
  { label: "Total Revenue", value: "₦1,074k", sub: "All time" },
  { label: "Avg Order Value", value: "₦1,074", sub: "Per order" },
  { label: "This Month", value: "₦1,074k", sub: "May 2025" },
  { label: "Today", value: "₦1,074", sub: "May 8, 2025" },
];

const SALES_HISTORY = [
  { id: "#SR-4821", product: "Lard bread", qty: 2, price: "₦2,400", status: "Completed", date: "Apr 12, 2025" },
  { id: "#SR-4822", product: "Butter rolls", qty: 5, price: "₦4,250", status: "Completed", date: "Apr 12, 2025" },
  { id: "#SR-4823", product: "Whole milk 1L", qty: 1, price: "₦1,800", status: "Completed", date: "Apr 11, 2025" },
  { id: "#SR-4824", product: "Chocolate cake", qty: 1, price: "₦4,500", status: "Cancelled", date: "Apr 11, 2025" },
  { id: "#SR-4825", product: "Fruit juice 50cl", qty: 3, price: "₦1,950", status: "Completed", date: "Apr 10, 2025" },
  { id: "#SR-4826", product: "Groundnut oil 1L", qty: 2, price: "₦6,400", status: "Completed", date: "Apr 10, 2025" },
];

const BANKS = ["Access Bank", "GTBank", "First Bank", "Zenith Bank", "UBA", "Polaris Bank"];

export default function StoresPage() {
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({ bank: "", account: "", amount: "" });

  function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawOpen(false);
    setWithdrawForm({ bank: "", account: "", amount: "" });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">All Stores</h1>
          <p className="text-sm text-slate-500 mt-0.5">Sales overview and earnings</p>
        </div>
        <button
          onClick={() => setWithdrawOpen(true)}
          className="h-9 px-5 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors"
        >
          Withdraw
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {topStats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-500 mb-2">{s.label}</p>
            <p className={`text-4xl font-black tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {revenueStats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-500 mb-1">{s.label}</p>
            <p className="text-2xl font-black text-slate-900 tabular-nums">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Sales history table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-black text-slate-900">Sales History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Order ID</th>
                <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Product</th>
                <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Qty</th>
                <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Price</th>
                <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SALES_HISTORY.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-black text-xs text-slate-900">{s.id}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{s.product}</td>
                  <td className="px-4 py-3 text-slate-600">{s.qty}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">{s.price}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${
                      s.status === "Completed" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{s.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Withdraw Modal */}
      {withdrawOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-black text-slate-900">Withdraw</h2>
              <button onClick={() => setWithdrawOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleWithdraw}>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Bank</label>
                  <select
                    required
                    value={withdrawForm.bank}
                    onChange={(e) => setWithdrawForm((p) => ({ ...p, bank: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] cursor-pointer"
                  >
                    <option value="">Select bank</option>
                    {BANKS.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Account Number</label>
                  <input
                    required
                    type="text"
                    maxLength={10}
                    value={withdrawForm.account}
                    onChange={(e) => setWithdrawForm((p) => ({ ...p, account: e.target.value.replace(/\D/g, "") }))}
                    placeholder="0123456789"
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Amount (₦)</label>
                  <input
                    required
                    type="number"
                    value={withdrawForm.amount}
                    onChange={(e) => setWithdrawForm((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                  />
                </div>
              </div>
              <div className="px-6 pb-5">
                <button
                  type="submit"
                  className="w-full h-10 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors"
                >
                  Withdraw Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
