import { cn } from "@/lib/cn";

type Review = {
  id: number;
  reviewer: string;
  initials: string;
  color: string;
  rating: number;
  comment: string;
  product: string;
  date: string;
};

const REVIEWS: Review[] = [
  { id: 1, reviewer: "Gerald Okeke", initials: "GO", color: "bg-blue-200 text-blue-800", rating: 5, comment: "Great product, very fresh and well packaged. Delivery was fast too! Will definitely order again.", product: "Lard bread", date: "Apr 12, 2025" },
  { id: 2, reviewer: "Ada Nwosu", initials: "AN", color: "bg-green-200 text-green-800", rating: 4, comment: "Good quality but slightly overpriced. Overall satisfied with the service.", product: "Butter rolls", date: "Apr 11, 2025" },
  { id: 3, reviewer: "Chika Obi", initials: "CO", color: "bg-purple-200 text-purple-800", rating: 3, comment: "Average experience. The product was okay but delivery took longer than expected.", product: "Whole milk 1L", date: "Apr 10, 2025" },
  { id: 4, reviewer: "James Taiwo", initials: "JT", color: "bg-amber-200 text-amber-800", rating: 5, comment: "Excellent! Will definitely order again. Top notch quality and super fast delivery.", product: "Fruit juice 50cl", date: "Apr 09, 2025" },
  { id: 5, reviewer: "Funke Adeleke", initials: "FA", color: "bg-pink-200 text-pink-800", rating: 4, comment: "Really happy with my order. Fresh and well packaged. Keep it up!", product: "Chocolate cake", date: "Apr 08, 2025" },
  { id: 6, reviewer: "Michael Eze", initials: "ME", color: "bg-red-200 text-red-800", rating: 2, comment: "Product was not as described. Packaging could be better. Not impressed with this order.", product: "Lard bread", date: "Apr 07, 2025" },
  { id: 7, reviewer: "Sarah Balogun", initials: "SB", color: "bg-teal-200 text-teal-800", rating: 5, comment: "Amazing service! The product quality is consistently great. This is my go-to store.", product: "Groundnut oil 1L", date: "Apr 06, 2025" },
  { id: 8, reviewer: "Emeka Dibia", initials: "ED", color: "bg-indigo-200 text-indigo-800", rating: 4, comment: "Good products and reliable delivery. Just wish the packaging was a bit sturdier.", product: "Butter rolls", date: "Apr 05, 2025" },
  { id: 9, reviewer: "Ngozi Ike", initials: "NI", color: "bg-cyan-200 text-cyan-800", rating: 5, comment: "Five stars all the way! Fresh products and very prompt service. Highly recommend.", product: "Lard bread", date: "Apr 04, 2025" },
];

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 24 24" fill={i < rating ? "#f59e0b" : "none"} stroke={i < rating ? "#f59e0b" : "#d1d5db"} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

const avgRating = (REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length).toFixed(1);

export default function ReviewsPage() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">All Reviews</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {REVIEWS.length} reviews · Avg {avgRating} ★
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 outline-none focus:border-[#056abf] cursor-pointer">
            <option>All ratings</option>
            <option>5 Stars</option>
            <option>4 Stars</option>
            <option>3 Stars</option>
            <option>2 Stars</option>
            <option>1 Star</option>
          </select>
          <select className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 outline-none focus:border-[#056abf] cursor-pointer">
            <option>Newest first</option>
            <option>Oldest first</option>
            <option>Highest rated</option>
            <option>Lowest rated</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REVIEWS.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className={cn("size-10 rounded-full grid place-items-center text-sm font-black shrink-0", r.color)}>
                {r.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-sm truncate">{r.reviewer}</p>
                <p className="text-xs text-slate-400">{r.date}</p>
              </div>
              <Stars rating={r.rating} />
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{r.comment}</p>
            <div className="mt-auto pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Product: <span className="font-semibold text-slate-600">{r.product}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
