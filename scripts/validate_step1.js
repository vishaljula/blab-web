#!/usr/bin/env node
/**
 * Step 1 validation — connection pooling
 *
 * Checks:
 * 1. Functional: correct listing count returned
 * 2. Performance: warm request timing vs 228ms baseline
 * 3. Config: pooler URL is set
 */

const http = require("http");
const fs = require("fs");

const URL = "http://localhost:3000/api/listings/viewport" +
  "?sw_lng=78.436849804355&sw_lat=17.331505077175862" +
  "&ne_lng=78.53655019564701&ne_lat=17.438479289562736&type=sale";

const BASELINE_MS = 228;
const EXPECTED_COUNT = 89;
const RUNS = 7;

function fetch(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => resolve({ ms: Date.now() - start, body: data, status: res.statusCode }));
    }).on("error", reject);
  });
}

async function main() {
  // 1. Config check
  const env = fs.readFileSync(".env.local", "utf-8");
  const hasPool = env.includes("DATABASE_URL_POOL=postgresql");
  const poolLine = env.split("\n").find(l => l.startsWith("DATABASE_URL_POOL=")) || "";
  console.log("━━━ Config ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  DATABASE_URL_POOL set: ${hasPool ? "✅ yes" : "❌ missing"}`);
  if (poolLine) console.log(`  Endpoint: ${poolLine.includes("-pooler") ? "✅ pooler" : "❌ direct (not pooler)"}`);

  // 2. Functional check (first request may be cold)
  console.log("\n━━━ Correctness ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const first = await fetch(URL);
  const listings = JSON.parse(first.body);
  const count = Array.isArray(listings) ? listings.length : "?";
  console.log(`  Status: ${first.status === 200 ? "✅" : "❌"} ${first.status}`);
  console.log(`  Listings returned: ${count === EXPECTED_COUNT ? "✅" : "⚠️"} ${count} (expected ${EXPECTED_COUNT})`);
  console.log(`  First request: ${first.ms}ms (may be cold)`);

  // 3. Warm timing — skip first, measure next RUNS
  console.log(`\n━━━ Warm Timing (${RUNS} requests) ━━━━━━━━━━━━━━━━━━━━━`);
  const times = [];
  for (let i = 1; i <= RUNS; i++) {
    const r = await fetch(URL);
    times.push(r.ms);
    const flag = r.ms < BASELINE_MS ? "✅" : r.ms < BASELINE_MS * 1.5 ? "⚠️" : "🐢";
    console.log(`  Request ${i}: ${r.ms}ms ${flag}`);
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const min = Math.min(...times);
  const improvement = Math.round((1 - avg / BASELINE_MS) * 100);
  console.log(`\n  Baseline avg:  ${BASELINE_MS}ms`);
  console.log(`  New avg:       ${avg}ms`);
  console.log(`  Best:          ${min}ms`);
  console.log(`  Improvement:   ${improvement > 0 ? "✅" : "❌"} ${improvement}% faster`);
}

main().catch(console.error);
