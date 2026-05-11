"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { cn } from "@/lib/cn";
import { auth } from "@/lib/firebase";
import { clearSession, getShopId } from "@/lib/session";
import { subscribeToProducts, type Product } from "@/lib/firestore";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    label: "Products",
    href: "/products",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    label: "Orders",
    href: "/orders",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    label: "Sales",
    href: "/stores",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    label: "Reviews",
    href: "/reviews",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    label: "Members",
    href: "/members",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

function stockColor(status: string) {
  if (status === "Out of Stock") return "bg-red-200";
  if (status === "Low Stock") return "bg-amber-200";
  return "bg-green-200";
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [updates, setUpdates] = useState<Product[]>([]);

  useEffect(() => {
    const shopId = getShopId();
    if (!shopId) return;
    const unsub = subscribeToProducts(shopId, (products) => {
      const sorted = [...products].sort((a, b) => a.stock - b.stock).slice(0, 3);
      setUpdates(sorted);
    });
    return () => unsub();
  }, []);

  return (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100 shrink-0">
        <Link href="/products" onClick={onClose} className="flex items-center gap-2.5">
          <Image src="/swiftrun-icon.png" alt="SwiftRun" width={36} height={36} className="rounded-lg" />
          <div>
            <Image src="/swiftrun-wordmark.png" alt="SwiftRun" width={90} height={18} className="object-contain" />
            <p className="text-xs text-slate-400 mt-0.5">Business</p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-0.5">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 h-11 rounded-lg px-3 text-sm font-semibold transition-colors",
                active
                  ? "bg-[#056abf] text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Stock Alerts */}
      <div className="px-3 pb-3 shrink-0">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
          Stock Alerts
        </p>
        <div className="space-y-0.5">
          {updates.length === 0 ? (
            <p className="text-xs text-slate-300 px-1">No products yet</p>
          ) : updates.map((p) => (
            <Link
              key={p.id}
              href="/products"
              onClick={onClose}
              className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-slate-50 cursor-pointer"
            >
              <div className={cn("size-8 rounded-md shrink-0", stockColor(p.status ?? "Active"))} />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                <p className="text-xs text-slate-400">Stock: {p.stock} {p.unit}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Logout */}
      <div className="px-3 pb-5 pt-3 border-t border-slate-100 shrink-0">
        <button
          onClick={() => setLogoutOpen(true)}
          className="flex items-center gap-3 h-11 w-full rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </div>

      {logoutOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-xs text-center">
            <div className="size-14 rounded-full bg-red-50 grid place-items-center mx-auto mb-4">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <h3 className="text-base font-black text-slate-900 mb-1.5">Logout</h3>
            <p className="text-slate-500 text-sm mb-6">Are you sure you want to logout?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setLogoutOpen(false)}
                className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  clearSession();
                  await signOut(auth);
                  router.push("/login");
                }}
                className="flex-1 h-10 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white min-h-dvh sticky top-0 self-start h-dvh overflow-y-auto">
        <SidebarContent />
      </aside>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-dvh w-72 bg-white flex flex-col border-r border-slate-200 overflow-y-auto transition-transform duration-300 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 size-8 rounded-lg border border-slate-200 grid place-items-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <SidebarContent onClose={onClose} />
      </aside>
    </>
  );
}
