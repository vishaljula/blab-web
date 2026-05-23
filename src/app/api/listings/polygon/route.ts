import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * POST /api/listings/polygon
 *
 * Fetches listings within a user-drawn polygon.
 * Body: { coordinates: number[][], listingType: "sale" | "rent" }
 *
 * The coordinates array is the polygon the user drew on the map —
 * an array of [lng, lat] pairs, with the last point == first point (closed).
 */
export async function POST(request: NextRequest) {
  let body: { coordinates?: number[][]; listingType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { coordinates, listingType = "sale" } = body;

  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 4) {
    return NextResponse.json(
      { error: "coordinates must be an array of at least 4 [lng, lat] pairs (closed polygon)" },
      { status: 400 }
    );
  }

  // Build GeoJSON polygon string for PostGIS
  const geoJSON = JSON.stringify({
    type: "Polygon",
    coordinates: [coordinates],
  });

  const sql = neon(process.env.DATABASE_URL!);

  const rows = await sql`
    SELECT
      id, latitude, longitude, price,
      property_type AS "propertyType",
      listing_type AS "listingType",
      lister_type AS "listerType",
      bedrooms, bathrooms,
      built_up_area AS "builtUpArea",
      plot_area AS "plotArea",
      address, city, image_url AS "imageUrl",
      contact_name AS "contactName"
    FROM listings
    WHERE ST_Within(
      ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
      ST_SetSRID(ST_GeomFromGeoJSON(${geoJSON}), 4326)
    )
    AND listing_type = ${listingType}
    ORDER BY created_at DESC
    LIMIT 200
  `;

  return NextResponse.json(rows);
}
