"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { clearSession, getRole, getShopId, setSession } from "@/lib/session";
import { MainHeader } from "@/components/main-header";
import { Sidebar } from "@/components/sidebar";
import { useFcmToken } from "@/hooks/use-fcm-token";

function shopCanOperate(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const isActive = data.isActive !== false;
  const status = String(data.status ?? "").trim().toLowerCase();
  return isActive && (status === "" || status === "active");
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);

  const OWNER_ONLY = ["/members", "/payout", "/stores", "/business"];

  useFcmToken(shopId);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      const email = (user.email ?? "").toLowerCase().trim();
      try {
        let resolvedShopId = getShopId();

        if (!resolvedShopId) {
          // No session — must be an owner logging in fresh
          const snap = await getDocs(query(collection(db, "Shops"), where("ownerEmail", "==", email)));
          if (snap.empty) {
            await auth.signOut();
            clearSession();
            router.replace("/login");
            return;
          }
          const shopDoc = snap.docs[0];
          if (!shopCanOperate(shopDoc.data())) {
            await auth.signOut();
            clearSession();
            router.replace("/login");
            return;
          }
          resolvedShopId = shopDoc.id;
          setSession(resolvedShopId, shopDoc.data().name ?? "My Shop", "owner");
        } else {
          // Session exists — always re-verify role from Firestore so old sessions get fixed
          const shopSnap = await getDoc(doc(db, "Shops", resolvedShopId));
          const shopData = shopSnap.data();
          if (!shopSnap.exists() || !shopCanOperate(shopData)) {
            await auth.signOut();
            clearSession();
            router.replace("/login");
            return;
          }
          const shopName = shopData?.name ?? "My Shop";
          const ownerEmail = (shopData?.ownerEmail ?? "").toLowerCase().trim();

          if (email === ownerEmail) {
            setSession(resolvedShopId, shopName, "owner");
          } else {
            // Direct doc lookup using uid — no index needed
            const memberSnap = await getDoc(doc(db, "Shops", resolvedShopId, "members", user.uid));
            if (!memberSnap.exists() || memberSnap.data()?.isActive === false) {
              await auth.signOut();
              clearSession();
              router.replace("/login");
              return;
            }
            const role = memberSnap.exists() ? (memberSnap.data()?.role ?? "Staff") : "Staff";
            setSession(resolvedShopId, shopName, role);
          }
        }

        setShopId(resolvedShopId);
      } catch {
        router.replace("/login");
        return;
      }

      setReady(true);
    });
    return () => unsub();
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Block staff/managers from restricted pages on every navigation
  useEffect(() => {
    if (!ready) return;
    const role = getRole();
    if (role !== "owner" && OWNER_ONLY.some((p) => pathname.startsWith(p))) {
      router.replace("/dashboard");
    }
  }, [pathname, ready]); // eslint-disable-line react-hooks/exhaustive-deps

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
