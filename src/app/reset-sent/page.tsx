"use client";

import { useRouter } from "next/navigation";

export default function ResetSentPage() {
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center gap-2 mb-8">
          <div className="size-9 rounded-lg bg-[#056abf] grid place-items-center text-white font-black text-base">
            S
          </div>
          <span className="text-xl font-black text-slate-900">
            Swift<span className="text-[#056abf]">Run</span>
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-10">
          <div className="size-16 rounded-full bg-blue-50 grid place-items-center mx-auto mb-5">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#056abf" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>
          <h1 className="text-lg font-black text-slate-900 mb-2">Reset link sent.</h1>
          <p className="text-slate-500 text-sm mb-8">Please check your email.</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full h-11 rounded-lg bg-[#056abf] text-white font-bold text-sm hover:bg-blue-700 transition-colors"
          >
            Open Email
          </button>
        </div>
      </div>
    </div>
  );
}
