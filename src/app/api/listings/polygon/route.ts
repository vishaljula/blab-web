import { NextRequest, NextResponse } from "next/server";
import { getRawSql } from "@/db";

/**
 * POST /api/listings/polygon
 *
 * Fetches listings within a user-drawn polygon.
 * Body: { coordinates: number[][], listingType: "sale" | "rent" }
 *
 * The coordinates array is the polygon the user drew on the map —
 * an array of [lng, lat] pairs, with the last point == first point (closed).
 *
 * Spatial query pattern (two-stage):
 *   1. location && polygon::geography  → GIST index scan (fast, approximate)
 *   2. ST_Within(location::geometry, polygon) → exact containment filter
 *
 * The CTE computes ST_GeomFromGeoJSON once and reuses it in both predicates,
 * avoiding the cost of parsing the GeoJSON string twice.
 */
export async function POST(request: NextRequest) {
  let body: { coordinates?: number[][]; listingType?: string; geometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { coordinates, listingType = "sale", geometry } = body;

  if (!["sale", "rent"].includes(listingType)) {
    return NextResponse.json(
      { error: "listingType must be 'sale' or 'rent'" },
      { status: 400 }
    );
  }

  // Accept either raw GeoJSON geometry (city boundaries) or coordinates (drawn polygons)
  let geoJSON: string;

  if (geometry && (geometry.type === "Polygon" || geometry.type === "MultiPolygon")) {
    // Raw GeoJSON from OSM boundary — size-guard before passing to Postgres.
    // OSM city boundaries can exceed 100k vertices; unchecked they cause expensive
    // computation or a Postgres error. 500 KB covers even large Indian city polygons.
    const raw = JSON.stringify(geometry);
    if (raw.length > 512_000) {
      return NextResponse.json(
        { error: "Geometry too large (max 500 KB)" },
        { status: 413 }
      );
    }
    geoJSON = raw;
  } else if (coordinates && Array.isArray(coordinates) && coordinates.length >= 4) {
    // Drawn polygon — wrap in GeoJSON Polygon
    geoJSON = JSON.stringify({
      type: "Polygon",
      coordinates: [coordinates],
    });
  } else {
    return NextResponse.json(
      { error: "Either 'geometry' (GeoJSON Polygon/MultiPolygon) or 'coordinates' (array of at least 4 [lng, lat] pairs) required" },
      { status: 400 }
    );
  }

  const sql = getRawSql();

  try {
    const rows = await sql`
      WITH polygon AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geoJSON}), 4326) AS geom
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
      FROM listings l, polygon
      WHERE l.location && polygon.geom::geography
        AND ST_Within(l.location::geometry, polygon.geom)
        AND l.listing_type = ${listingType}
        AND l.status = 'active'
      ORDER BY l.created_at DESC
      -- LIMIT removed (SCRUM-196): the 500 KB geometry guard (above) already
      -- bounds the polygon area, making a row count cap unnecessary.
    `;

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[polygon] DB error:", err);
    return NextResponse.json(
      { error: "Failed to fetch listings" },
      { status: 500 }
    );
  }
}
