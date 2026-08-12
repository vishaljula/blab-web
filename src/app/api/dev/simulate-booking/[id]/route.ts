/**
 * POST /api/dev/simulate-booking/[id]
 *
 * DEV ONLY — auto-simulates a shutterbug GPS journey for a given booking.
 * Called automatically by Step5Schedule after booking is confirmed (dev mode).
 *
 * What it does:
 *  1. Verifies the booking exists and is assigned to a shutterbug
 *  2. Flips booking status → en_route
 *  3. Streams 15 GPS waypoints from LB Nagar toward the property
 *     (one every 8 seconds in background, non-blocking)
 *  4. Returns immediately so the UI doesn't wait
 *
 * This is ONLY active when NODE_ENV !== 'production'.
 */

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

// LB Nagar start positions
const START_POINTS = [
  { lat: 17.3442, lng: 78.5520 }, // LB Nagar Bus Depot
  { lat: 17.3350, lng: 78.5610 }, // Saroornagar Junction
  { lat: 17.3530, lng: 78.5465 }, // Chaitanyapuri X-roads
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

async function runSimulation(
  bookingId: string,
  shutterbugId: string,
  shutterbugToken: string,
  propLat: number,
  propLng: number,
  baseUrl: string
) {
  const STEPS = 15;
  const INTERVAL_MS = 8000;

  // Pick furthest start point
  const start = START_POINTS[Math.floor(Math.random() * START_POINTS.length)];

  // Build waypoints with via-points
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

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const next = waypoints[Math.min(i + 1, waypoints.length - 1)];
    const head = bearing(wp.lat, wp.lng, next.lat, next.lng);

    try {
      await fetch(`${baseUrl}/api/shutterbug/location`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${shutterbugToken}`,
        },
        body: JSON.stringify({
          bookingId,
          lat: wp.lat,
          lng: wp.lng,
          heading: head,
          speed: 25 + Math.random() * 10,
        }),
      });
    } catch {
      // Ignore errors in simulation
    }

    if (i < waypoints.length - 1) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  }

  // Mark complete
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    UPDATE photography_bookings
    SET status = 'completed', updated_at = NOW()
    WHERE id = ${bookingId}
  `;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Hard-gate: never run in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const { id: bookingId } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  // Fetch booking + shutterbug token
  const [booking] = await sql`
    SELECT pb.id, pb.status, pb.assigned_shutterbug_id,
           l.latitude AS prop_lat, l.longitude AS prop_lng,
           u.push_token AS shutterbug_push_token
    FROM photography_bookings pb
    JOIN listings l ON l.id = pb.listing_id
    LEFT JOIN users u ON u.id = pb.assigned_shutterbug_id
    WHERE pb.id = ${bookingId}
    LIMIT 1
  `;

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (!booking.assigned_shutterbug_id) {
    return NextResponse.json({ error: "No shutterbug assigned to this booking" }, { status: 400 });
  }

  // Generate a token for the virtual shutterbug to call /api/shutterbug/location
  const { encrypt } = await import("@/lib/crypto");
  const shutterbugToken = encrypt(JSON.stringify({
    userId: booking.assigned_shutterbug_id,
    expiry: Date.now() + 60 * 60 * 1000, // 1 hour
  }));

  // Determine base URL for internal API calls
  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${proto}://${host}`;

  // Run simulation in background (don't await — return immediately)
  runSimulation(
    bookingId,
    booking.assigned_shutterbug_id,
    shutterbugToken,
    parseFloat(booking.prop_lat),
    parseFloat(booking.prop_lng),
    baseUrl
  ).catch(console.error);

  return NextResponse.json({
    success: true,
    message: "Simulation started — shutterbug will begin moving in ~8 seconds",
    bookingId,
    trackingUrl: `/tracking/${bookingId}`,
  });
}
