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
import { setLocation, setBookingRoute, type LiveLocation } from "@/lib/location-store";

// Start ~0.6–0.9 km (straight line) from the actual property, random direction
function getStartPointNear(propLat: number, propLng: number) {
  const offsets = [
    { dLat: -0.005, dLng: -0.004 },
    { dLat: 0.006, dLng: -0.004 },
    { dLat: -0.004, dLng: 0.006 },
    { dLat: 0.005, dLng: 0.005 },
  ];
  const pick = offsets[Math.floor(Math.random() * offsets.length)];
  return { lat: propLat + pick.dLat, lng: propLng + pick.dLng };
}

type LngLat = [number, number];

function haversine(a: LngLat, b: LngLat) {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function bearing(a: LngLat, b: LngLat) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLng = rad(b[0] - a[0]);
  const y = Math.sin(dLng) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
    Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Real road geometry from Mapbox Directions (straight line only as a last resort) */
export async function fetchRoadRoute(start: LngLat, dest: LngLat): Promise<LngLat[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) {
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${dest[0]},${dest[1]}?geometries=geojson&overview=full&access_token=${token}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const coords: LngLat[] | undefined = data?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length > 1) return coords;
      }
    } catch (e) {
      console.warn("[sim] Mapbox route fetch failed:", e);
    }
  }
  return [start, dest];
}

/** Point at `d` metres along the polyline + heading of that segment */
function pointAlong(route: LngLat[], cum: number[], d: number): { pt: LngLat; head: number } {
  const total = cum[cum.length - 1];
  const dd = Math.max(0, Math.min(total, d));
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < dd) i++;
  const seg = cum[i + 1] - cum[i];
  const t = seg === 0 ? 0 : (dd - cum[i]) / seg;
  const a = route[i];
  const b = route[i + 1];
  return {
    pt: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    head: bearing(a, b),
  };
}

const PING_INTERVAL_MS = 2_000; // driver app GPS ping cadence
const CRUISE_MPS = 12; // ~43 km/h city scooter

// One live simulation per booking: a new run supersedes (cancels) the previous one
const g = globalThis as unknown as { __simRuns?: Map<string, number> };
const simRuns = (g.__simRuns ??= new Map<string, number>());

export async function runSimulation(
  bookingId: string,
  propLat: number,
  propLng: number
): Promise<{ route: LngLat[]; initialLocation: LiveLocation }> {
  const sql = neon(process.env.DATABASE_URL!);
  const runId = Date.now();
  simRuns.set(bookingId, runId);

  const start = getStartPointNear(propLat, propLng);

  // 1. Fetch road geometry + mark booking en_route in parallel BEFORE returning,
  //    then seed both the road polyline and the road-snapped initial GPS ping in Redis.
  const [route] = await Promise.all([
    fetchRoadRoute([start.lng, start.lat], [propLng, propLat]),
    sql`
      UPDATE photography_bookings
      SET status = 'en_route',
          lifecycle_state = 'en_route',
          arrival_otp = COALESCE(arrival_otp, '482910'),
          travel_started_at = NOW(),
          tracking_started_at = NOW(),
          updated_at = NOW()
      WHERE id = ${bookingId}
    `,
  ]);

  const cum: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    cum.push(cum[i - 1] + haversine(route[i - 1], route[i]));
  }
  const total = cum[cum.length - 1];

  const firstPt = pointAlong(route, cum, 0);
  const initialLocation: LiveLocation = {
    lat: firstPt.pt[1],
    lng: firstPt.pt[0],
    heading: firstPt.head,
    speed: CRUISE_MPS * 3.6,
    ts: Date.now(),
  };

  await Promise.all([
    setLocation(bookingId, initialLocation),
    setBookingRoute(bookingId, route),
  ]);

  console.log(`[sim] booking ${bookingId} → en_route, route ${(total / 1000).toFixed(2)} km`);

  // 2. Continue streaming subsequent GPS pings along the road in the background
  (async () => {
    try {
      let dist = 0;
      let speed = CRUISE_MPS;
      while (simRuns.get(bookingId) === runId) {
        await new Promise((r) => setTimeout(r, PING_INTERVAL_MS));
        if (simRuns.get(bookingId) !== runId) return;
        speed = Math.max(7, Math.min(15, speed + (Math.random() - 0.5) * 2));
        dist = Math.min(total, dist + speed * (PING_INTERVAL_MS / 1000));
        const { pt, head } = pointAlong(route, cum, dist);
        await setLocation(bookingId, {
          lat: pt[1],
          lng: pt[0],
          heading: head,
          speed: speed * 3.6,
          ts: Date.now(),
        });
        if (dist >= total) break;
      }

      if (simRuns.get(bookingId) !== runId) return; // superseded by a newer run
      simRuns.delete(bookingId);
      await sql`
        UPDATE photography_bookings
        SET status = 'completed',
            lifecycle_state = 'arrived',
            arrived_at = NOW(),
            updated_at = NOW()
        WHERE id = ${bookingId}
      `;
      console.log(`[sim] booking ${bookingId} → arrived`);
    } catch (err) {
      console.error("[sim] background simulation error:", err);
    }
  })();

  return { route, initialLocation };
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
    SELECT pb.id, pb.status, pb.arrival_otp,
           l.latitude      AS prop_lat,
           l.longitude     AS prop_lng,
           l.address       AS prop_address,
           l.property_type AS prop_type
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

  // Await initial DB + road route + Redis seeding so /track and client have everything on frame 1
  const { route, initialLocation } = await runSimulation(bookingId, propLat, propLng);

  return NextResponse.json({
    success: true,
    message: "Simulation started — watch /tracking/" + bookingId,
    bookingId,
    propLat,
    propLng,
    route,
    shutterbugLocation: initialLocation,
    propertyLocation: { lat: propLat, lng: propLng },
    propertyAddress: booking.prop_address ?? null,
    propertyType: booking.prop_type ?? null,
    arrivalOtp: booking.arrival_otp ?? "482910",
  });
}
