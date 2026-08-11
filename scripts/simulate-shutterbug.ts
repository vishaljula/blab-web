/**
 * simulate-shutterbug.ts
 *
 * Simulates a Shutterbug driving from LB Nagar Bus Depot toward a booked property.
 * Posts GPS location updates every 10 seconds to the local dev server.
 * The customer's tracking screen will show the animated marker moving in real time.
 *
 * Usage:
 *   npx tsx scripts/simulate-shutterbug.ts \
 *     --token "YOUR_SHUTTERBUG_AUTH_TOKEN" \
 *     --booking-id "UUID"
 *
 * Optional flags:
 *   --api-url http://localhost:3000   (default)
 *   --interval 10                     (seconds between updates, default 10)
 *   --steps 20                        (total waypoints to simulate, default 20)
 *   --start-lat 17.3450               (override starting lat)
 *   --start-lng 78.5490               (override starting lng)
 *
 * Run from the project root (blab-web/).
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

// ─── Arg parsing ──────────────────────────────────────────────────────────────
function arg(name: string, fallback?: string): string {
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required argument: ${name}`);
}

const token      = arg("--token");
const bookingId  = arg("--booking-id");
const apiUrl     = arg("--api-url",    "http://localhost:3000");
const intervalMs = parseInt(arg("--interval", "10"), 10) * 1000;
const steps      = parseInt(arg("--steps",    "20"), 10);

// ─── LB Nagar start positions (realistic spots) ───────────────────────────────
// These are real road-accessible spots inside the 5km service zone.
const START_POINTS = [
  { name: "LB Nagar Bus Depot",      lat: 17.3442, lng: 78.5520 },
  { name: "Saroornagar Junction",     lat: 17.3350, lng: 78.5610 },
  { name: "Chaitanyapuri X-roads",   lat: 17.3530, lng: 78.5465 },
  { name: "Vanasthalipuram Main Rd", lat: 17.3280, lng: 78.5540 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Add a small random jitter (± maxMetres) so the path looks like driving, not teleporting */
function jitter(val: number, maxDeg: number): number {
  return val + (Math.random() - 0.5) * maxDeg;
}

/** Bearing (degrees) from point A to point B */
function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Haversine distance in km */
function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log(`\n🚗  Blab Shutterbug GPS Simulator`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Booking    : ${bookingId}`);
  console.log(`  API        : ${apiUrl}`);
  console.log(`  Interval   : ${intervalMs / 1000}s   Steps: ${steps}`);

  // ── 1. Fetch booking to get property location ─────────────────────────────
  const [booking] = await sql`
    SELECT pb.id, pb.status, l.latitude AS property_lat, l.longitude AS property_lng,
           l.address AS property_address
    FROM photography_bookings pb
    JOIN listings l ON l.id = pb.listing_id
    WHERE pb.id = ${bookingId}
    LIMIT 1
  `;

  if (!booking) {
    console.error(`\n❌  Booking ${bookingId} not found. Did you run seed-test-shutterbug.ts first?`);
    process.exit(1);
  }

  const propLat = parseFloat(booking.property_lat ?? "17.3496");
  const propLng = parseFloat(booking.property_lng ?? "78.5521");

  console.log(`  Destination: ${booking.property_address}`);
  console.log(`               (${propLat.toFixed(4)}, ${propLng.toFixed(4)})`);
  console.log(`  Booking ID : ${booking.id}  status: ${booking.status}`);

  // ── 2. Pick start point ──────────────────────────────────────────────────
  let startLat: number, startLng: number;
  try {
    startLat = parseFloat(arg("--start-lat", ""));
    startLng = parseFloat(arg("--start-lng", ""));
  } catch {
    // No override — pick the start point furthest from property for drama
    let best = START_POINTS[0];
    let maxDist = 0;
    for (const p of START_POINTS) {
      const d = distKm(p.lat, p.lng, propLat, propLng);
      if (d > maxDist) { maxDist = d; best = p; }
    }
    startLat = best.lat;
    startLng = best.lng;
    console.log(`  Starting at: ${best.name} (${best.lat.toFixed(4)}, ${best.lng.toFixed(4)})`);
    console.log(`  Distance   : ${maxDist.toFixed(2)} km`);
  }

  const totalTimeSec = (steps * intervalMs) / 1000;
  console.log(`  ETA        : ~${formatTime(steps * intervalMs)} total sim time`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // ── 3. Optional: mark booking as confirmed (if still pending) ─────────────
  if (booking.status === "pending") {
    await sql`
      UPDATE photography_bookings
      SET status = 'confirmed', updated_at = NOW()
      WHERE id = ${bookingId}
    `;
    console.log("  ✔ Booking marked as 'confirmed'");
  }

  // ── 4. Simulate movement ─────────────────────────────────────────────────
  // Generate a slightly jagged path (adds realism vs. straight line)
  // We'll add 2 random "via" waypoints between start and destination
  const viaPoints: Array<{ lat: number; lng: number }> = [
    { lat: startLat, lng: startLng },
    {
      lat: jitter(lerp(startLat, propLat, 0.33), 0.002),
      lng: jitter(lerp(startLng, propLng, 0.33), 0.002),
    },
    {
      lat: jitter(lerp(startLat, propLat, 0.67), 0.002),
      lng: jitter(lerp(startLng, propLng, 0.67), 0.002),
    },
    { lat: propLat, lng: propLng },
  ];

  // Distribute steps proportionally across each leg
  const legs = viaPoints.length - 1;
  const stepsPerLeg = Math.floor(steps / legs);

  const waypoints: Array<{ lat: number; lng: number }> = [];
  for (let leg = 0; leg < legs; leg++) {
    const from = viaPoints[leg];
    const to   = viaPoints[leg + 1];
    const legSteps = leg === legs - 1 ? steps - waypoints.length : stepsPerLeg;
    for (let s = 0; s < legSteps; s++) {
      const t = s / legSteps;
      waypoints.push({
        lat: jitter(lerp(from.lat, to.lat, t), 0.0003),
        lng: jitter(lerp(from.lng, to.lng, t), 0.0003),
      });
    }
  }
  // Always end exactly at the property
  waypoints.push({ lat: propLat, lng: propLng });

  let firstUpdate = true;
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const next = waypoints[Math.min(i + 1, waypoints.length - 1)];
    const head = bearing(wp.lat, wp.lng, next.lat, next.lng);
    const remaining = distKm(wp.lat, wp.lng, propLat, propLng);
    const etaMin = Math.ceil((remaining / 30) * 60); // assume 30km/h

    // POST to API
    try {
      const res = await fetch(`${apiUrl}/api/shutterbug/location`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bookingId,
          lat: wp.lat,
          lng: wp.lng,
          heading: head,
          speed: 25 + Math.random() * 10, // 25-35 km/h
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error(`  ❌ API error ${res.status}:`, data);
        if (res.status === 401) {
          console.error("  → Token invalid. Did you copy the full token from seed-test-shutterbug.ts?");
          process.exit(1);
        }
      } else {
        if (firstUpdate) {
          console.log("  ✔ First update sent — booking is now 'en_route'");
          console.log(`  → Open the tracking screen now:`);
          console.log(`     ${apiUrl}/tracking/${bookingId}\n`);
          firstUpdate = false;
        }
      }
    } catch (err: any) {
      console.error(`  ❌ Network error: ${err.message}`);
      console.error("  → Is 'npm run dev' running on localhost:3000?");
    }

    const progress = Math.round(((i + 1) / waypoints.length) * 100);
    const bar = "█".repeat(Math.round(progress / 5)) + "░".repeat(20 - Math.round(progress / 5));
    process.stdout.write(
      `\r  [${bar}] ${progress}%  📍 (${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)})  ↗ ${Math.round(head)}°  ETA ~${etaMin}min   `
    );

    // Don't sleep after the last step
    if (i < waypoints.length - 1) {
      await sleep(intervalMs);
    }
  }

  console.log("\n\n  🏁 Simulation complete — Shutterbug arrived at property!");
  console.log(`  → Now mark the job done: POST ${apiUrl}/api/shutterbug/jobs/${bookingId}/complete`);
  console.log(`     with Authorization: Bearer <token>\n`);

  // Print a ready curl command
  console.log("  Curl shortcut:");
  console.log(`  curl -X POST ${apiUrl}/api/shutterbug/jobs/${bookingId}/complete \\`);
  console.log(`    -H "Authorization: Bearer ${token}"\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
