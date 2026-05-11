"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getShopId, setSession } from "@/lib/session";
import { MainHeader } from "@/components/main-header";
import { Sidebar } from "@/components/sidebar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      if (!getShopId()) {
        try {
          const q = query(collection(db, "Shops"), where("ownerEmail", "==", (user.email ?? "").toLowerCase().trim()));
          const snap = await getDocs(q);
          if (snap.empty) {
            await auth.signOut();
            router.replace("/login");
            return;
          }
          const doc = snap.docs[0];
          setSession(doc.id, doc.data().name ?? "My Shop");
        } catch {
          router.replace("/login");
          return;
        }
      }
      setReady(true);
    });
    return () => unsub();
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-lg bg-[#056abf] grid place-items-center">
            <svg className="animate-spin size-5 text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-500">Loading your store…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-slate-50">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex flex-1 min-w-0 flex-col">
        <MainHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
