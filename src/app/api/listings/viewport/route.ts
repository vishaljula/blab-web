import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * GET /api/listings/viewport
 *
 * Fetches listings within the visible map bounding box.
 * Query params: sw_lng, sw_lat, ne_lng, ne_lat, type (sale|rent)
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const swLng = parseFloat(params.get("sw_lng") || "");
  const swLat = parseFloat(params.get("sw_lat") || "");
  const neLng = parseFloat(params.get("ne_lng") || "");
  const neLat = parseFloat(params.get("ne_lat") || "");
  const listingType = params.get("type") || "sale";

  if ([swLng, swLat, neLng, neLat].some(isNaN)) {
    return NextResponse.json(
      { error: "Missing or invalid bounds: sw_lng, sw_lat, ne_lng, ne_lat required" },
      { status: 400 }
    );
  }

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
    WHERE latitude BETWEEN ${swLat} AND ${neLat}
      AND longitude BETWEEN ${swLng} AND ${neLng}
      AND listing_type = ${listingType}
    ORDER BY created_at DESC
    LIMIT 200
  `;

  return NextResponse.json(rows);
}
