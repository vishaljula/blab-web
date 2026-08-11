#!/usr/bin/env node
// Runs EXPLAIN ANALYZE against Neon and prints the query plan
const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);

async function main() {
  const rows = await sql`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT id, latitude, longitude, price,
      property_type, listing_type, lister_type,
      bedrooms, bathrooms, built_up_area, plot_area,
      address, city, image_url, contact_name, contact_phone
    FROM listings
    WHERE location && ST_MakeEnvelope(78.436849804355, 17.331505077175862, 78.53655019564701, 17.438479289562736, 4326)::geography
      AND listing_type = 'sale'
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 200
  `;
  rows.forEach(r => console.log(r["QUERY PLAN"]));
}

main().catch(console.error);
