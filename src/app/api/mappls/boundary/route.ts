import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/mappls/boundary?name=Hyderabad&state=Telangana&lat=17.38&lng=78.48
 *
 * Fetches GeoJSON boundary polygon from OpenStreetMap Nominatim.
 * Validates the result is within 50km of the expected location to prevent
 * returning polygons for same-named places in different regions.
 */
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  const state = request.nextUrl.searchParams.get("state") || "";
  const expectedLat = parseFloat(request.nextUrl.searchParams.get("lat") || "0");
  const expectedLng = parseFloat(request.nextUrl.searchParams.get("lng") || "0");

  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  try {
    // Build Nominatim query — include state for better accuracy
    const query = state
      ? `${name}, ${state}, India`
      : `${name}, India`;

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}` +
        `&format=json&polygon_geojson=1&limit=5&addressdetails=1`,
      {
        headers: { "User-Agent": "Blab-RealEstate/1.0" },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Nominatim failed" }, { status: 502 });
    }

    const data = await res.json();

    // Find the first result with an actual polygon (not a Point)
    // that is also geographically close to the expected location
    const hasExpectedCoords = isFinite(expectedLat) && isFinite(expectedLng) &&
      (expectedLat !== 0 || expectedLng !== 0);

    const withPolygon = data.find(
      (r: { geojson?: { type?: string }; lat?: string; lon?: string }) => {
        const isPolygon =
          r.geojson?.type === "Polygon" || r.geojson?.type === "MultiPolygon";
        if (!isPolygon) return false;

        // If we have expected coords, verify the result is nearby (< 50km)
        if (hasExpectedCoords && r.lat && r.lon) {
          const dist = haversineKm(
            expectedLat, expectedLng,
            parseFloat(r.lat), parseFloat(r.lon)
          );
          if (dist > 50) return false; // Wrong place with same name
        }

        return true;
      }
    );

    if (!withPolygon) {
      return NextResponse.json({ boundary: null, reason: "no polygon data" });
    }

    return NextResponse.json({
      boundary: withPolygon.geojson,
      bbox: withPolygon.boundingbox, // [south, north, west, east]
      displayName: withPolygon.display_name,
    });
  } catch (err) {
    console.error("Boundary fetch error:", err);
    return NextResponse.json({ error: "Boundary fetch failed" }, { status: 500 });
  }
}

/** Haversine distance in km between two lat/lng points */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
