#!/usr/bin/env node
/**
 * Investigate: why does location && ST_MakeEnvelope return 10 listings
 * that appear outside the bounding box coordinates?
 */
const { neon } = require("@neondatabase/serverless");

const SW_LNG = 78.436849804355,  SW_LAT = 17.331505077175862;
const NE_LNG = 78.53655019564701, NE_LAT = 17.438479289562736;

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  // Get the listings returned by the spatial query
  const spatialRows = await sql`
    SELECT id, latitude, longitude
    FROM listings
    WHERE location && ST_MakeEnvelope(${SW_LNG}, ${SW_LAT}, ${NE_LNG}, ${NE_LAT}, 4326)::geography
      AND listing_type = 'sale'
      AND status = 'active'
  `;

  // Get the listings returned by the old BETWEEN query
  const betweenRows = await sql`
    SELECT id, latitude, longitude
    FROM listings
    WHERE latitude  BETWEEN ${SW_LAT} AND ${NE_LAT}
      AND longitude BETWEEN ${SW_LNG} AND ${NE_LNG}
      AND listing_type = 'sale'
      AND status = 'active'
  `;

  console.log(`\nSpatial query (&&):   ${spatialRows.length} rows`);
  console.log(`BETWEEN query:        ${betweenRows.length} rows`);

  const betweenIds = new Set(betweenRows.map(r => r.id));
  const spatialOnly = spatialRows.filter(r => !betweenIds.has(r.id));

  console.log(`\nIn spatial but NOT in BETWEEN (${spatialOnly.length}):`);
  spatialOnly.forEach(r => {
    const latDiff = r.latitude  < SW_LAT ? (r.latitude  - SW_LAT).toFixed(6)
                  : r.latitude  > NE_LAT ? (r.latitude  - NE_LAT).toFixed(6) : "in";
    const lngDiff = r.longitude < SW_LNG ? (r.longitude - SW_LNG).toFixed(6)
                  : r.longitude > NE_LNG ? (r.longitude - NE_LNG).toFixed(6) : "in";
    console.log(`  lat=${r.latitude.toFixed(8)}  lng=${r.longitude.toFixed(8)}`
      + `  lat_overshoot=${latDiff}  lng_overshoot=${lngDiff}`);
  });

  // Also check: is location && ... using the POINT bbox correctly?
  // Verify by checking if ST_Within gives the same result as BETWEEN
  const withinRows = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM listings
    WHERE ST_Within(location::geometry, ST_MakeEnvelope(${SW_LNG}, ${SW_LAT}, ${NE_LNG}, ${NE_LAT}, 4326))
      AND listing_type = 'sale'
      AND status = 'active'
  `;
  console.log(`\nST_Within (exact):    ${withinRows[0].cnt} rows`);
  console.log(`\nConclusion:`);
  console.log(`  BETWEEN:    ${betweenRows.length} (flat coordinate comparison)`);
  console.log(`  ST_Within:  ${withinRows[0].cnt} (exact spatial containment)`);
  console.log(`  && (GIST):  ${spatialRows.length} (bounding-box intersection, may over-select at edges)`);
}

main().catch(console.error);
