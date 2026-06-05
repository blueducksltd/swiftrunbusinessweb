"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase";
import { getShopId } from "@/lib/session";

type Review = {
  id: string;
  userName: string;
  rating: number;
  comment: string;
  updatedAt: { seconds: number } | null;
};

function formatDate(ts: { seconds: number } | null): string {
  if (!ts) return "";
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 24 24"
          fill={i < rating ? "#f59e0b" : "none"}
          stroke={i < rating ? "#f59e0b" : "#d1d5db"}
          strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState(0);
  const [sort, setSort] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");

  useEffect(() => {
    const shopId = getShopId();
    if (!shopId) return;
    const q = query(
      collection(db, "Shops", shopId, "reviews"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const nextReviews = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userName: (data.userName as string) || "Anonymous",
            rating: (data.rating as number) || 0,
            comment: (data.comment as string) || "",
            updatedAt: data.updatedAt ?? null,
          };
        });
      setReviews(nextReviews);
      const validRatings = nextReviews
        .map((r) => Number(r.rating))
        .filter((rating) => Number.isFinite(rating) && rating > 0);
      const avg = validRatings.length
        ? Math.round((validRatings.reduce((sum, rating) => sum + rating, 0) / validRatings.length) * 100) / 100
        : 0;
      setDoc(doc(db, "Shops", shopId), {
        rating: avg,
        totalRatings: validRatings.length,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = reviews
    .filter((r) => ratingFilter === 0 || r.rating === ratingFilter)
    .sort((a, b) => {
      if (sort === "oldest") return (a.updatedAt?.seconds ?? 0) - (b.updatedAt?.seconds ?? 0);
      if (sort === "highest") return b.rating - a.rating;
      if (sort === "lowest") return a.rating - b.rating;
      return (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0);
    });

  const avg = reviews.length
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">All Reviews</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "Loading…" : reviews.length === 0
              ? "No reviews yet"
              : `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}${avg ? ` · Avg ${avg} ★` : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(Number(e.target.value))}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 outline-none focus:border-[#056abf] cursor-pointer"
          >
            <option value={0}>All ratings</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n} Stars</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 outline-none focus:border-[#056abf] cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest rated</option>
            <option value="lowest">Lowest rated</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="size-8 rounded-full border-2 border-[#056abf] border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" className="mb-3">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <p className="text-sm font-semibold text-slate-400">
            {ratingFilter > 0 ? `No ${ratingFilter}-star reviews` : "No reviews yet"}
          </p>
          <p className="text-xs text-slate-300 mt-1">Reviews from customers will appear here in real time</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "size-10 rounded-full grid place-items-center text-sm font-black shrink-0 bg-blue-50 text-[#056abf]"
                )}>
                  {r.userName.trim()[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-sm truncate">{r.userName}</p>
                  <p className="text-xs text-slate-400">{formatDate(r.updatedAt)}</p>
                </div>
                <Stars rating={r.rating} />
              </div>
              {r.comment && (
                <p className="text-sm text-slate-600 leading-relaxed">{r.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
