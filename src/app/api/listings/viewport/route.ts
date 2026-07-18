import { NextRequest, NextResponse } from "next/server";
import { getRawSql } from "@/db";
import { polygonToCells } from "h3-js";

/**
 * GET /api/listings/viewport
 *
 * Returns individual listing pins for the current viewport — always Listing[],
 * never cluster count objects. One representative listing (highest boost_score,
 * then newest) per H3 cell at low/mid zoom; all active listings at street level.
 *
 * Resolution ladder (consistent ~50-100 pin density at every zoom level):
 *   zoom < 8                      → too zoomed-out, return []
 *   zoom 8-9                      → DISTINCT ON h3_index_res5  (~252 km²/cell, state/region)
 *   zoom 10-11                    → DISTINCT ON h3_index_res6  (~36 km²/cell,  city area)
 *   zoom 12                       → DISTINCT ON h3_index_res7  (~5 km²/cell,   neighbourhood)
 *   zoom 13                       → DISTINCT ON h3_index_res8  (~0.74 km²/cell, city block)
 *   zoom ≥ VIEWPORT_STREET_ZOOM   → all active listings (default: 11 for MVP, raise to 14 at scale)
 *
 * How it works (B-tree, not GIST):
 *   1. h3-js polygonToCells() converts the viewport bbox into H3 cell IDs
 *      entirely in-process (~0.1ms, no DB).
 *   2. WHERE h3_index_resN = ANY($cells::h3index[]) does one B-tree lookup per
 *      cell — O(log n) per cell, near-constant total regardless of listing count.
 *   3. DISTINCT ON (h3_index_resN) picks the winner per cell:
 *      premium listings first (boost_score DESC), then newest (created_at DESC).
 *   4. AND latitude/longitude BETWEEN padded bounds: edge-cell representatives
 *      captured without phantom pins — see PAD table near the query for details.
 *
 * ⚠️  h3-js v4 API: polygonToCells uses [lng, lat] (GeoJSON convention),
 *     while latLngToCell uses (lat, lng). Always build rings as [lng, lat] pairs.
 *
 * Query params: sw_lng, sw_lat, ne_lng, ne_lat, type (sale|rent), zoom (0-22)
 */

const MIN_ZOOM  = 8;     // below this the cell array would be enormous
const MAX_CELLS = 5000;  // safety cap — if polygonToCells exceeds this, bail early

// ─── Zoom → H3 resolution ladder ────────────────────────────────────────────
//
// Each entry means: "from this zoom up to (but not including) the next entry,
// use this H3 resolution for DISTINCT ON representative-pin queries."
//
// resolution -1 = "street level" — skip H3 grouping, return ALL active listings.
//
// Tune VIEWPORT_STREET_ZOOM env var to shift the raw-listing threshold without
// touching code:
//   13  → MVP default (sparse data, show all from block zoom)
//   14  → production default (dense data, H3 grouping all the way to block level)
//
// Cell sizes for reference:
//   res5 ~252 km²  (state / region)
//   res6 ~36  km²  (city area)
//   res7 ~5   km²  (neighbourhood)
//   res8 ~0.74 km² (city block)
//
const STREET_ZOOM = parseInt(process.env.VIEWPORT_STREET_ZOOM ?? "13", 10);

const ZOOM_LADDER: Array<{ maxZoom: number; resolution: number }> = [
  { maxZoom:  9, resolution: 5 }, // state/region   (~252 km²/cell)
  { maxZoom: 11, resolution: 6 }, // city area      (~36  km²/cell)
  { maxZoom: 12, resolution: 7 }, // neighbourhood  (~5   km²/cell)
  { maxZoom: 13, resolution: 8 }, // block          (~0.74 km²/cell)
  // zoom >= STREET_ZOOM → resolution -1 (raw listings, handled separately)
];

/**
 * Returns the H3 resolution to use for DISTINCT ON grouping at the given zoom,
 * or -1 if the zoom is at/above STREET_ZOOM (raw listings mode).
 */
function zoomToResolution(zoom: number): number {
  if (zoom >= STREET_ZOOM) return -1;
  return ZOOM_LADDER.find(({ maxZoom }) => zoom <= maxZoom)?.resolution ?? 8;
}


/** Select columns returned to the client — same shape for all query modes. */
const SELECT_COLS = `
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
`;

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
    return NextResponse.json({ error: "type must be 'sale' or 'rent'" }, { status: 400 });
  }
  if (isNaN(zoom) || zoom < 0 || zoom > 22) {
    return NextResponse.json({ error: "zoom must be 0-22" }, { status: 400 });
  }

  // Guard: too zoomed-out → cell array would be enormous
  if (zoom < MIN_ZOOM) {
    return NextResponse.json({ listings: [], total: 0 });
  }

  const sql = getRawSql();
  const resolution = zoomToResolution(zoom);

  try {
    // ── Street level (zoom ≥ 14): all listings in viewport ────────────────────
    // No LIMIT — at zoom ≥ 14 the viewport covers ~0.25 km², so the coordinate
    // BETWEEN filter naturally bounds the result. Every seller's listing is visible.
    if (resolution === -1) {
      const rows = await sql.query(
        `SELECT ${SELECT_COLS}
         FROM listings l
         WHERE l.latitude  BETWEEN $1 AND $2
           AND l.longitude BETWEEN $3 AND $4
           AND l.listing_type = $5
           AND l.status = 'active'
         ORDER BY l.created_at DESC`,
        [swLat, neLat, swLng, neLng, listingType]
      );
      // At street level every listing is returned — total === shown count
      return NextResponse.json({ listings: rows, total: rows.length });
    }

    // ── H3 DISTINCT ON mode (zoom 8-13) ───────────────────────────────────────
    //
    // Step 1: Compute H3 cells that overlap the viewport (pure math, no DB, ~0.1ms).
    //
    // ⚠️  h3-js v4: polygonToCells uses [lng, lat] (GeoJSON), while latLngToCell
    //     uses (lat, lng). Ring MUST be built as [lng, lat] pairs.
    const ring: [number, number][] = [
      [swLng, swLat],  // SW corner
      [swLng, neLat],  // NW corner
      [neLng, neLat],  // NE corner
      [neLng, swLat],  // SE corner
      [swLng, swLat],  // close the ring
    ];

    const cells = polygonToCells(ring, resolution, true);

    if (cells.length === 0) return NextResponse.json({ listings: [], total: 0 });

    // Safety: enormous viewports at low zoom can produce too many cells
    if (cells.length > MAX_CELLS) {
      console.warn(`[viewport] zoom=${zoom} res=${resolution} produced ${cells.length} cells — bailing`);
      return NextResponse.json({ listings: [], total: 0 });
    }

    // Step 2: Build a PostgreSQL array literal from cell IDs.
    // h3 IDs only contain [0-9a-f] chars — safe to embed directly.
    const cellsLiteral = `{${cells.join(",")}}`;

    // Step 3: Dynamic DISTINCT ON query — one representative listing per H3 cell.
    //
    // The column name (h3_index_res5 … h3_index_res8) is determined by our
    // zoomToResolution() — not user input — so string interpolation is safe.
    //
    // Ordering: boost_score DESC, created_at DESC
    //   → premium listings (boost_score > 0) win their cell (monetisation)
    //   → ties broken by recency (newest listing wins)
    //
    // Padded bbox for the DISTINCT ON query.
    //
    // Problem: the exact viewport bbox caused edge-cell representatives to be
    // silently dropped when the newest listing sat just outside the boundary,
    // producing fewer pins on pan even though the cell was clearly visible.
    //
    // Full removal of the filter caused the opposite problem: edge cells whose
    // representative listing is far from the viewport showed phantom pins in the
    // ListView with no corresponding marker on the map.
    //
    // Solution: expand the bbox by ~half a cell diameter per resolution so
    // edge-cell representatives are almost certainly captured, while listings
    // from cells clearly outside the viewport are still excluded.
    //
    // Approximate cell circumradius in degrees (max distance from cell center to any vertex):
    //   res5 ~252 km² → ~0.09°   res6 ~36 km² → ~0.034°
    //   res7 ~5 km²   → ~0.013°  res8 ~0.74 km² → ~0.005°
    const col = `h3_index_res${resolution}`;
    const PAD: Record<number, number> = { 5: 0.09, 6: 0.034, 7: 0.013, 8: 0.005 };
    const pad = PAD[resolution] ?? 0.034;

    // Run DISTINCT ON and COUNT in parallel — one B-tree index hit each.
    // - DISTINCT ON uses padded bbox → catches edge-cell representatives
    // - COUNT uses exact bbox → total reflects only truly visible listings
    const [rows, countRows] = await Promise.all([
      sql.query(
        `SELECT DISTINCT ON (l.${col})
           ${SELECT_COLS}
         FROM listings l
         WHERE l.${col} = ANY($1::h3index[])
           AND l.latitude  BETWEEN $2 AND $3
           AND l.longitude BETWEEN $4 AND $5
           AND l.listing_type = $6
           AND l.status = 'active'
         ORDER BY l.${col}, l.boost_score DESC, l.created_at DESC`,
        [cellsLiteral, swLat - pad, neLat + pad, swLng - pad, neLng + pad, listingType]
      ),
      sql.query(
        `SELECT COUNT(*) AS total
         FROM listings
         WHERE ${col} = ANY($1::h3index[])
           AND latitude  BETWEEN $2 AND $3
           AND longitude BETWEEN $4 AND $5
           AND listing_type = $6
           AND status = 'active'`,
        [cellsLiteral, swLat, neLat, swLng, neLng, listingType]
      ),
    ]);

    const total = parseInt(String(countRows[0]?.total ?? rows.length), 10);
    return NextResponse.json({ listings: rows, total });

  } catch (err) {
    console.error("[viewport] DB error:", err);
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
  }
}
