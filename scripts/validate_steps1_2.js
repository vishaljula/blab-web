#!/usr/bin/env node
/**
 * validate_steps1_2.js — Connection pooling + GIST index validation
 *
 * Checks:
 *  Config:       DATABASE_URL_POOL is set and uses the pooler endpoint
 *  DB (GIST):    idx_listings_location index exists and is type GIST
 *  DB (plan):    EXPLAIN confirms "Index Scan using idx_listings_location" (not Seq Scan)
 *  Spatial:      Every returned listing actually falls inside the queried bounding box
 *  Correctness:  HTTP 200, response is an array, no empty result
 *  Performance:  Warm API timing vs 228ms baseline (7 requests after 1 warm-up)
 */

const http = require("http");
const fs   = require("fs");
const { neon } = require("@neondatabase/serverless");

// ── Config ────────────────────────────────────────────────────────────────────
const SW_LNG = 78.436849804355,  SW_LAT = 17.331505077175862;
const NE_LNG = 78.53655019564701, NE_LAT = 17.438479289562736;
const TYPE = "sale";

const BASELINE_MS = 228;
const WARM_RUNS   = 7;

const API_URL =
  `http://localhost:3000/api/listings/viewport` +
  `?sw_lng=${SW_LNG}&sw_lat=${SW_LAT}&ne_lng=${NE_LNG}&ne_lat=${NE_LAT}&type=${TYPE}`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fetchApi(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => resolve({ ms: Date.now() - start, body: data, status: res.statusCode }));
    }).on("error", reject);
  });
}

let pass = 0, fail = 0;
function ok(label, value, detail = "") {
  if (value) { console.log(`  ✅  ${label}${detail ? "  →  " + detail : ""}`); pass++; }
  else        { console.log(`  ❌  ${label}${detail ? "  →  " + detail : ""}`); fail++; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // ── 1. Config ──────────────────────────────────────────────────────────────
  console.log("\n━━━ 1. Config ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const env = fs.readFileSync(".env.local", "utf-8");
  const poolLine = env.split("\n").find(l => l.startsWith("DATABASE_URL_POOL=")) || "";
  ok("DATABASE_URL_POOL is set", poolLine.length > 0);
  ok("Endpoint uses -pooler hostname", poolLine.includes("-pooler."));

  // ── 2. DB: index existence ─────────────────────────────────────────────────
  console.log("\n━━━ 2. Database — Index Existence ━━━━━━━━━━━━━━━━━━━━");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.log("  ❌ DATABASE_URL not set — skipping DB checks"); }
  else {
    const sql = neon(dbUrl);

    // Check idx_listings_location exists and is GIST
    const [idxRow] = await sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'listings'
        AND indexname = 'idx_listings_location'
    `;
    ok("idx_listings_location index exists",       !!idxRow);
    ok("Index type is GIST",                       idxRow?.indexdef?.includes("USING gist"));

    // Check old lat/lng B-tree indexes are gone
    const oldIndexes = await sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'listings'
        AND indexname IN ('idx_listings_lat', 'idx_listings_lng')
    `;
    ok("Old lat/lng B-tree indexes dropped",       oldIndexes.length === 0,
      oldIndexes.length > 0 ? `still present: ${oldIndexes.map(r => r.indexname).join(", ")}` : "");

    // Check generated 'location' column exists
    const [colRow] = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'column_name' -- just checking generated col exists differently
    `;
    // Use pg catalog instead
    const [genCol] = await sql`
      SELECT attname FROM pg_attribute
      WHERE attrelid = 'listings'::regclass
        AND attname = 'location'
        AND attnum > 0
    `;
    ok("Generated 'location' column exists",       !!genCol);

    // ── 3. DB: query plan ───────────────────────────────────────────────────
    console.log("\n━━━ 3. Database — Query Plan ━━━━━━━━━━━━━━━━━━━━━━━━");
    const planRows = await sql`
      EXPLAIN (ANALYZE, FORMAT TEXT)
      SELECT id, latitude, longitude
      FROM listings
      WHERE location && ST_MakeEnvelope(${SW_LNG}, ${SW_LAT}, ${NE_LNG}, ${NE_LAT}, 4326)::geography
        AND listing_type = ${TYPE}
        AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 200
    `;
    const plan = planRows.map(r => r["QUERY PLAN"]).join("\n");
    const usesIndex = plan.includes("Index Scan using idx_listings_location");
    const noSeqScan = !plan.includes("Seq Scan on listings");
    ok("Query uses idx_listings_location (Index Scan)",  usesIndex);
    ok("No full Seq Scan on listings",                   noSeqScan);
    // Print abbreviated plan
    const costLine = planRows[0]?.["QUERY PLAN"] || "";
    console.log(`  Plan: ${costLine.trim()}`);
  }

  // ── 4. API: functional correctness ─────────────────────────────────────────
  console.log("\n━━━ 4. API — Functional Correctness ━━━━━━━━━━━━━━━━━━");
  const warmUp = await fetchApi(API_URL);
  ok("HTTP 200",               warmUp.status === 200,  `got ${warmUp.status}`);

  let listings = [];
  try { listings = JSON.parse(warmUp.body); } catch { ok("Response is valid JSON", false); }
  ok("Response is an array",   Array.isArray(listings), `type: ${typeof listings}`);
  ok("At least 1 listing",     listings.length > 0,    `count: ${listings.length}`);

  // Spatial correctness: every listing must be within the queried bounding box
  const outOfBounds = listings.filter(l =>
    l.latitude  < SW_LAT - 0.0001 || l.latitude  > NE_LAT + 0.0001 ||
    l.longitude < SW_LNG - 0.0001 || l.longitude > NE_LNG + 0.0001
  );
  ok("All listings within bounding box", outOfBounds.length === 0,
    outOfBounds.length > 0
      ? `${outOfBounds.length} out-of-bounds listings found`
      : `${listings.length} listings checked`
  );
  console.log(`  Total listings in bbox: ${listings.length}`);

  // ── 5. Performance ─────────────────────────────────────────────────────────
  console.log(`\n━━━ 5. Performance — ${WARM_RUNS} Warm Requests ━━━━━━━━━━━━━━━━━`);
  const times = [];
  for (let i = 1; i <= WARM_RUNS; i++) {
    const r = await fetchApi(API_URL);
    times.push(r.ms);
    const flag = r.ms < BASELINE_MS * 0.5 ? "✅" : r.ms < BASELINE_MS ? "⚠️ " : "🐢";
    console.log(`  Request ${i}: ${r.ms}ms ${flag}`);
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const min = Math.min(...times);
  const pct = Math.round((1 - avg / BASELINE_MS) * 100);
  console.log(`\n  Baseline:    ${BASELINE_MS}ms`);
  console.log(`  Average:     ${avg}ms`);
  console.log(`  Best:        ${min}ms`);
  console.log(`  Improvement: ${pct > 0 ? "✅" : "❌"} ${pct}% faster than baseline`);
  ok("Avg response faster than baseline", avg < BASELINE_MS, `${avg}ms vs ${BASELINE_MS}ms`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Passed: ${pass}   Failed: ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
