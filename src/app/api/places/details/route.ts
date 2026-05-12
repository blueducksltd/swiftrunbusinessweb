import { NextResponse } from "next/server";

const GOOGLE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

export async function GET(request: Request) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { status: "CONFIG_ERROR", error_message: "Google Maps API key is not configured." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("place_id")?.trim() || "";
  if (!placeId) {
    return NextResponse.json(
      { status: "INVALID_REQUEST", error_message: "place_id is required." },
      { status: 400 }
    );
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: "formatted_address,geometry",
    key,
  });

  const res = await fetch(`${GOOGLE_DETAILS_URL}?${params}`, {
    next: { revalidate: 60 },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
