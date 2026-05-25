"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { collection, collectionGroup, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { setSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, form.email, form.password);
      const email = (cred.user.email ?? "").toLowerCase().trim();

      // Check if owner
      const ownerSnap = await getDocs(query(collection(db, "Shops"), where("ownerEmail", "==", email)));
      if (!ownerSnap.empty) {
        const shopDoc = ownerSnap.docs[0];
        setSession(shopDoc.id, shopDoc.data().name ?? "");
        router.push("/dashboard");
        return;
      }

      // Check if staff member across all shops
      const memberSnap = await getDocs(query(collectionGroup(db, "members"), where("email", "==", email)));
      if (!memberSnap.empty) {
        const memberDoc = memberSnap.docs[0];
        const shopId = memberDoc.ref.parent.parent?.id ?? "";
        const shopDoc = shopId ? await getDocs(query(collection(db, "Shops"), where("__name__", "==", shopId))) : null;
        const shopName = shopDoc?.docs[0]?.data().name ?? "My Shop";
        setSession(shopId, shopName);
        router.push("/dashboard");
        return;
      }

      await auth.signOut();
      setError("No shop found for this account. Contact admin to register your shop.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("invalid-credential") || msg.includes("wrong-password") || msg.includes("user-not-found")) {
        setError("Invalid email or password.");
      } else if (msg.includes("too-many-requests")) {
        setError("Too many attempts. Try again later.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.MouseEvent) {
    e.preventDefault();
    if (!form.email) {
      setError("Enter your email above first.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, form.email);
      router.push("/reset-sent");
    } catch {
      setError("Could not send reset email. Check the address and try again.");
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <Image src="/swiftrun-icon.png" alt="SwiftRun" width={40} height={40} className="rounded-xl" />
            <Image src="/swiftrun-wordmark.png" alt="SwiftRun" width={110} height={22} className="object-contain" />
          </div>
          <p className="text-slate-500 text-sm leading-relaxed">
            Provide your business account details to get started.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="business@email.com"
                className="w-full h-11 rounded-lg border border-slate-200 px-4 text-sm font-medium outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/20 transition-all placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                className="w-full h-11 rounded-lg border border-slate-200 px-4 text-sm font-medium outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/20 transition-all"
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <div>
              <button
                type="button"
                onClick={handleForgot}
                className="text-sm text-[#056abf] font-semibold hover:underline"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-[#056abf] text-white font-bold text-sm hover:bg-blue-700 transition-colors mt-1 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
