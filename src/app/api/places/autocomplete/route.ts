import { NextResponse } from "next/server";

const GOOGLE_PLACES_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json";

export async function GET(request: Request) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { status: "CONFIG_ERROR", error_message: "Google Maps API key is not configured." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const input = searchParams.get("input")?.trim() || "";
  if (input.length < 3) {
    return NextResponse.json({ status: "ZERO_RESULTS", predictions: [] });
  }

  const params = new URLSearchParams({
    input,
    key,
  });

  const location = searchParams.get("location");
  const radius = searchParams.get("radius");
  if (location) params.set("location", location);
  if (radius) params.set("radius", radius);

  const res = await fetch(`${GOOGLE_PLACES_URL}?${params}`, {
    next: { revalidate: 60 },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
