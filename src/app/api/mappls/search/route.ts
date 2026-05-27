import { NextRequest, NextResponse } from "next/server";
import { getMapplsAccessToken } from "@/lib/mappls";

/**
 * GET /api/mappls/search?q=Hyderabad&lat=17.38&lng=78.48
 *
 * Proxies search to Mappls Autosuggest API with server-side OAuth.
 * Accepts optional lat/lng to bias results toward the user's current map center.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  const lat = request.nextUrl.searchParams.get("lat") || "17.385";
  const lng = request.nextUrl.searchParams.get("lng") || "78.4867";

  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { error: "Query 'q' required (min 2 chars)" },
      { status: 400 }
    );
  }

  try {
    const token = await getMapplsAccessToken();

    const url = `https://atlas.mappls.com/api/places/search/json?query=${encodeURIComponent(
      query
    )}&location=${lat},${lng}&region=IND&tokenizeAddress=true`;

    const res = await fetch(url, {
      headers: { Authorization: `bearer ${token}` },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Mappls API failed" }, { status: 502 });
    }

    const data = await res.json();
    const raw = (data.suggestedLocations || []).slice(0, 6);

    // Map results and resolve missing coordinates via Mapbox geocoding fallback
    // NOTE: Mapbox is used only for coordinate resolution when Mappls returns
    // city/state results without lat/lng. This dependency can be removed once
    // Mappls eLoc→coords lookup is implemented.
    const suggestions = await Promise.all(
      raw.map(
        async (s: {
          placeName?: string;
          placeAddress?: string;
          latitude?: number | string;
          longitude?: number | string;
          eLoc?: string;
          type?: string;
        }) => {
          let resultLat = typeof s.latitude === "string" ? parseFloat(s.latitude) : s.latitude;
          let resultLng = typeof s.longitude === "string" ? parseFloat(s.longitude) : s.longitude;

          if ((!resultLat || !resultLng || isNaN(resultLat) || isNaN(resultLng)) && s.placeName) {
            try {
              const mbToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
              const geoRes = await fetch(
                `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(
                  s.placeName + " " + (s.placeAddress || "India")
                )}&country=IN&limit=1&access_token=${mbToken}`
              );
              if (geoRes.ok) {
                const geoData = await geoRes.json();
                const feat = geoData.features?.[0];
                if (feat?.geometry?.coordinates) {
                  resultLng = feat.geometry.coordinates[0];
                  resultLat = feat.geometry.coordinates[1];
                }
              }
            } catch {}
          }

          return {
            name: s.placeName || query,
            address: s.placeAddress || "",
            lat: resultLat || 0,
            lng: resultLng || 0,
            eLoc: s.eLoc || "",
            type: s.type || "",
          };
        }
      )
    );

    return NextResponse.json(suggestions);
  } catch (err) {
    console.error("Mappls search error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
