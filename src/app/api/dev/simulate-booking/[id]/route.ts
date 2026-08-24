/**
 * POST /api/dev/simulate-booking/[id]
 *
 * DEV ONLY — simulates a shutterbug GPS journey for a given booking.
 * Self-contained: no shutterbug needs to be assigned. Updates DB + Redis directly.
 *
 * Flow:
 *  1. Reads property lat/lng from the booking's listing
 *  2. Sets booking status → en_route
 *  3. Streams 15 GPS waypoints into Redis (key: location:[bookingId])
 *     every 8 seconds in the background
 *  4. Sets booking status → completed when done
 *  5. Returns immediately (non-blocking)
 */

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { redis } from "@/lib/redis";

// LB Nagar start positions (Hyderabad)
const START_POINTS = [
  { lat: 17.3442, lng: 78.5520 },
  { lat: 17.3350, lng: 78.5610 },
  { lat: 17.3530, lng: 78.5465 },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function jitter(v: number, d: number) {
  return v + (Math.random() - 0.5) * d;
}
function bearing(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

async function runSimulation(bookingId: string, propLat: number, propLng: number) {
  const sql = neon(process.env.DATABASE_URL!);
  const STEPS = 15;
  const INTERVAL_MS = 8_000;

  const start = START_POINTS[Math.floor(Math.random() * START_POINTS.length)];

  // Build waypoints: start → 35% → 70% → property
  const via = [
    { lat: start.lat, lng: start.lng },
    { lat: jitter(lerp(start.lat, propLat, 0.35), 0.002), lng: jitter(lerp(start.lng, propLng, 0.35), 0.002) },
    { lat: jitter(lerp(start.lat, propLat, 0.70), 0.002), lng: jitter(lerp(start.lng, propLng, 0.70), 0.002) },
    { lat: propLat, lng: propLng },
  ];

  const waypoints: Array<{ lat: number; lng: number }> = [];
  const legs = via.length - 1;
  for (let leg = 0; leg < legs; leg++) {
    const from = via[leg];
    const to = via[leg + 1];
    const legSteps = leg === legs - 1 ? STEPS - waypoints.length : Math.floor(STEPS / legs);
    for (let s = 0; s < legSteps; s++) {
      const t = s / legSteps;
      waypoints.push({
        lat: jitter(lerp(from.lat, to.lat, t), 0.0003),
        lng: jitter(lerp(from.lng, to.lng, t), 0.0003),
      });
    }
  }
  waypoints.push({ lat: propLat, lng: propLng });

  // Set booking en_route immediately
  await sql`
    UPDATE photography_bookings
    SET status = 'en_route', updated_at = NOW()
    WHERE id = ${bookingId}
  `;
  console.log(`[sim] booking ${bookingId} → en_route, streaming ${waypoints.length} waypoints`);

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const next = waypoints[Math.min(i + 1, waypoints.length - 1)];
    const head = bearing(wp.lat, wp.lng, next.lat, next.lng);

    const locationPayload = {
      lat: wp.lat,
      lng: wp.lng,
      heading: head,
      speed: 25 + Math.random() * 10,
      ts: Date.now(),
    };

    // Write directly to Redis — no shutterbug auth token needed
    if (redis) {
      try {
        await redis.set(`location:${bookingId}`, JSON.stringify(locationPayload), { ex: 3600 });
        console.log(`[sim] waypoint ${i + 1}/${waypoints.length}: lat=${wp.lat.toFixed(4)}, lng=${wp.lng.toFixed(4)}`);
      } catch (e) {
        console.warn(`[sim] Redis write failed at step ${i}:`, e);
      }
    } else {
      console.warn(`[sim] Redis not available — location updates won't be visible`);
    }

    if (i < waypoints.length - 1) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  }

  // Mark complete
  await sql`
    UPDATE photography_bookings
    SET status = 'completed', updated_at = NOW()
    WHERE id = ${bookingId}
  `;
  console.log(`[sim] booking ${bookingId} → completed`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const { id: bookingId } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  // Fetch booking + property coords — no shutterbug assignment required
  const [booking] = await sql`
    SELECT pb.id, pb.status,
           l.latitude  AS prop_lat,
           l.longitude AS prop_lng
    FROM photography_bookings pb
    JOIN listings l ON l.id = pb.listing_id
    WHERE pb.id = ${bookingId}
    LIMIT 1
  `;

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const propLat = parseFloat(booking.prop_lat);
  const propLng = parseFloat(booking.prop_lng);

  if (!propLat || !propLng) {
    return NextResponse.json({ error: "Booking has no property coordinates" }, { status: 400 });
  }

  // Run simulation in background — return immediately
  runSimulation(bookingId, propLat, propLng).catch(console.error);

  return NextResponse.json({
    success: true,
    message: "Simulation started — watch /tracking/" + bookingId,
    bookingId,
    propLat,
    propLng,
  });
}
