import { NextRequest, NextResponse } from "next/server";
import { getRawSql } from "@/db";

/**
 * GET /api/listings/viewport
 *
 * Zoom-conditional response (SCRUM-196):
 *
 *   zoom < 12  → H3 aggregation mode
 *     Returns ~10-50 hex cluster objects for the viewport. The B-tree index on
 *     h3_index_res7 makes GROUP BY efficient. The GIST index on `location` still
 *     handles the WHERE bbox pre-filter. Payload is tiny (a few KB) regardless
 *     of how many listings exist underneath — scales to billions.
 *     Response: { type: "clusters", data: ClusterPoint[] }
 *
 *   zoom ≥ 12  → Individual listings mode (current behaviour)
 *     Returns individual listing rows. LIMIT 200 removed — the zoom gate ensures
 *     the viewport is geographically small enough to bound the result set naturally.
 *     Supercluster on the client handles final visual grouping + price pin rendering.
 *     Response: { type: "listings", data: Listing[] }
 *
 * Zoom thresholds:
 *   < 12  → res7 hex cells (~86 km²/cell, neighborhood level)
 *   ≥ 12  → individual pins
 *
 * Query params: sw_lng, sw_lat, ne_lng, ne_lat, type (sale|rent), zoom (int 0-22)
 */

const CLUSTER_ZOOM_THRESHOLD = 12;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const swLng = parseFloat(params.get("sw_lng") || "");
  const swLat = parseFloat(params.get("sw_lat") || "");
  const neLng = parseFloat(params.get("ne_lng") || "");
  const neLat = parseFloat(params.get("ne_lat") || "");
  const listingType = params.get("type") || "sale";
  const zoom = parseInt(params.get("zoom") || "14", 10);

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

  if (isNaN(zoom) || zoom < 0 || zoom > 22) {
    return NextResponse.json(
      { error: "zoom must be an integer between 0 and 22" },
      { status: 400 }
    );
  }

  const sql = getRawSql();

  try {
    if (zoom < CLUSTER_ZOOM_THRESHOLD) {
      // ── H3 aggregation mode (zoomed out) ─────────────────────────────────────
      // GROUP BY h3_index_res7 collapses all listings into ~10-50 hex cells.
      // AVG(lat/lng) gives the centroid of actual listings in each cell —
      // close enough to the true hex centroid for cluster badge placement.
      // min_price lets the client show "from ₹45L" if desired.
      const rows = await sql`
        WITH bbox AS (
          SELECT ST_MakeEnvelope(${swLng}, ${swLat}, ${neLng}, ${neLat}, 4326) AS geom
        )
        SELECT
          h3_index_res7::text   AS h3index,
          COUNT(*)::int         AS count,
          MIN(price)            AS min_price,
          AVG(latitude)::float  AS lat,
          AVG(longitude)::float AS lng
        FROM listings, bbox
        WHERE location && bbox.geom::geography
          AND ST_Within(location::geometry, bbox.geom)
          AND listing_type = ${listingType}
          AND status = 'active'
        GROUP BY h3_index_res7
        ORDER BY count DESC
      `;

      return NextResponse.json({ type: "clusters", data: rows });
    }

    // ── Individual listings mode (zoomed in) ─────────────────────────────────
    // Same two-stage spatial filter as before (GIST → ST_Within).
    // LIMIT 200 removed — zoom gate bounds the result set geographically.
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
    `;

    return NextResponse.json({ type: "listings", data: rows });
  } catch (err) {
    console.error("[viewport] DB error:", err);
    return NextResponse.json(
      { error: "Failed to fetch listings" },
      { status: 500 }
    );
  }
}
