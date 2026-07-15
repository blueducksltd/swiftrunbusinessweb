"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { getRole, getShopId, getShopName } from "@/lib/session";
import { getBusinessFaqs } from "@/lib/firestore";
import { authenticatedFetch } from "@/lib/authenticated-fetch";

const CATEGORIES = ["Orders", "Payouts", "Products", "Account", "Other"];

// Shown only if the admin hasn't published any Business FAQs yet.
const FALLBACK_FAQS: { q: string; a: string }[] = [
  {
    q: "How do I add or update products?",
    a: "Go to Products in the sidebar, then use Add Product or tap any product to edit its details, price, and stock.",
  },
  {
    q: "When and how do I get paid?",
    a: "Payouts are sent to the bank account on your Payout page. Owners can review pending and completed payouts there. If a payout looks missing, send us a message below with the order reference.",
  },
  {
    q: "Why is an order not showing up?",
    a: "New orders appear under Orders in real time. If one is missing, check that your store is marked Open in Business Profile, then refresh. Still missing? Contact us with the order details.",
  },
  {
    q: "How do I add a team member?",
    a: "Owners can invite staff from the Members page. Invited members sign in with the email you add and get access based on their role.",
  },
  {
    q: "How do I change my store hours or address?",
    a: "Open Business Profile (owners only) to update your name, address, opening hours, logo, and banner.",
  },
];

export default function SupportPage() {
  const searchParams = useSearchParams();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [faqs, setFaqs] = useState(FALLBACK_FAQS);

  useEffect(() => {
    getBusinessFaqs()
      .then((items) => {
        if (items.length) setFaqs(items.map((f) => ({ q: f.question, a: f.answer })));
      })
      .catch(() => {
        // Keep the fallback FAQs if the read fails.
      });
  }, []);

  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const rawSearchTerm = searchParams.get("q") ?? "";
  const searchTerm = rawSearchTerm.trim().toLowerCase();
  const filteredFaqs = searchTerm
    ? faqs.filter((item) => {
        const haystack = [item.q, item.a];
        return haystack.some((value) => value.toLowerCase().includes(searchTerm));
      })
    : faqs;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!subject.trim() || !message.trim()) {
      setError("Please add a subject and a message.");
      return;
    }
    setSending(true);
    try {
      const res = await authenticatedFetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject,
          message,
          contactEmail,
          shopId: getShopId(),
          shopName: getShopName(),
          role: getRole(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.reason || "Could not send your message.");
      }
      setSent(true);
      setSubject("");
      setMessage("");
      setContactEmail("");
      setCategory(CATEGORIES[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-black text-slate-900">Support</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {searchTerm
            ? `${filteredFaqs.length} help article${filteredFaqs.length === 1 ? "" : "s"} matching "${rawSearchTerm.trim()}"`
            : "Find quick answers or send the SwiftRun team a message"}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        {/* FAQ */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-4">
            Frequently asked
          </h2>
          <div className="space-y-2">
            {filteredFaqs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-slate-400">No matching help articles</p>
                <p className="text-xs text-slate-300 mt-1">Try another keyword or send us a message.</p>
              </div>
            ) : filteredFaqs.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={i} className="border border-slate-100 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="flex items-center justify-between w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm font-bold text-slate-800 pr-3">{item.q}</span>
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {open && (
                    <p className="px-4 pb-3.5 text-sm text-slate-500 leading-relaxed">{item.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Contact form */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-4">
            Send us a message
          </h2>

          {sent ? (
            <div className="text-center py-10">
              <div className="size-14 rounded-full bg-green-50 grid place-items-center mx-auto mb-4">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-base font-black text-slate-900 mb-1.5">Message sent</h3>
              <p className="text-slate-500 text-sm mb-6">
                Thanks — our team will get back to you by email.
              </p>
              <button
                onClick={() => setSent(false)}
                className="h-10 px-5 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:border-[#056abf]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary of your issue"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:border-[#056abf]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Tell us what's going on, with any order references if relevant."
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:border-[#056abf] resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                  Reply-to email <span className="font-medium text-slate-400">(optional)</span>
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Where should we reply?"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:border-[#056abf]"
                />
              </div>

              {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={sending}
                className="h-11 w-full rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
