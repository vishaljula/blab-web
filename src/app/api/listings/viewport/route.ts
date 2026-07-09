import { NextRequest, NextResponse } from "next/server";
import { getRawSql } from "@/db";

/**
 * GET /api/listings/viewport
 *
 * Fetches listings within the visible map bounding box.
 * Query params: sw_lng, sw_lat, ne_lng, ne_lat, type (sale|rent)
 *
 * Spatial query pattern (two-stage):
 *   1. location && bbox::geography  → GIST index scan (fast, approximate)
 *   2. ST_Within(location::geometry, bbox) → exact containment filter
 *
 * The CTE computes ST_MakeEnvelope once and reuses it in both predicates.
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

  if (!["sale", "rent"].includes(listingType)) {
    return NextResponse.json(
      { error: "type must be 'sale' or 'rent'" },
      { status: 400 }
    );
  }

  const sql = getRawSql();

  try {
    const rows = await sql`
      WITH bbox AS (
        SELECT ST_MakeEnvelope(${swLng}, ${swLat}, ${neLng}, ${neLat}, 4326) AS geom
      )
      SELECT
        l.id, l.latitude, l.longitude, l.price,
        l.property_type AS "propertyType",
        l.listing_type  AS "listingType",
        l.lister_type   AS "listerType",
        l.bedrooms, l.bathrooms,
        l.built_up_area AS "builtUpArea",
        l.plot_area     AS "plotArea",
        l.address, l.city,
        l.image_url     AS "imageUrl",
        l.contact_name  AS "contactName",
        l.contact_phone AS "contactPhone"
      FROM listings l, bbox
      WHERE l.location && bbox.geom::geography
        AND ST_Within(l.location::geometry, bbox.geom)
        AND l.listing_type = ${listingType}
        AND l.status = 'active'
      ORDER BY l.created_at DESC
      LIMIT 200
    `;

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[viewport] DB error:", err);
    return NextResponse.json(
      { error: "Failed to fetch listings" },
      { status: 500 }
    );
  }
}
