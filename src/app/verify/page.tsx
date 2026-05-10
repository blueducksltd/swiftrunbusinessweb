"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
  const router = useRouter();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(index: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && index < 5) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="size-9 rounded-lg bg-[#056abf] grid place-items-center text-white font-black text-base">
              S
            </div>
            <span className="text-xl font-black text-slate-900">
              Swift<span className="text-[#056abf]">Run</span>
            </span>
          </div>
          <p className="text-slate-700 font-semibold text-sm leading-relaxed">
            Enter the 6-digit code sent to your email to log in.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-7">
          <div className="flex gap-2 justify-center mb-8">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="size-12 text-center text-xl font-black rounded-lg border-2 border-slate-200 outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/20 transition-all"
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Link
              href="/reset-sent"
              className="text-sm text-[#056abf] font-semibold hover:underline"
            >
              Forgot Password?
            </Link>
            <button
              onClick={() => router.push("/dashboard")}
              className="h-10 px-6 rounded-lg bg-[#056abf] text-white font-bold text-sm hover:bg-blue-700 transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
