import { NextRequest, NextResponse } from "next/server";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

/**
 * GET /api/geo/city?q=Hyderabad
 *
 * Geocodes a city name via Mapbox Geocoding API and returns the bounding box.
 * Server-side to keep Mapbox usage consolidated and cacheable.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required (min 2 chars)" },
      { status: 400 }
    );
  }

  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(
    query
  )}&country=IN&types=place,locality&limit=5&access_token=${MAPBOX_TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json(
      { error: "Geocoding API failed" },
      { status: 502 }
    );
  }

  const data = await res.json();
  const features = data.features || [];

  const results = features.map(
    (f: {
      properties: {
        full_address?: string;
        name?: string;
        place_formatted?: string;
        bbox?: [number, number, number, number];
      };
      geometry: { coordinates: [number, number] };
    }) => ({
      name: f.properties.name || f.properties.full_address || query,
      fullAddress: f.properties.place_formatted || f.properties.full_address,
      center: f.geometry.coordinates, // [lng, lat]
      bbox: f.properties.bbox || null,
    })
  );

  return NextResponse.json(results);
}
