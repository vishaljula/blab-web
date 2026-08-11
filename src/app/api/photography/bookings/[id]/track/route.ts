import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

/**
 * GET /api/photography/bookings/[id]/track
 *
 * Returns the live location of the assigned shutterbug for this booking.
 * Called by the customer tracking screen every 10 seconds.
 *
 * Response:
 *   { status, shutterbugLocation: { lat, lng, heading, ts } | null, eta_minutes: number | null }
 *
 * Auth: Bearer token (must belong to the booking's customer)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    let customerId: string;
    try {
      const decrypted = decrypt(token);
      const payload = JSON.parse(decrypted);
      if (!payload.userId || payload.expiry < Date.now())
        return NextResponse.json({ success: false, error: "Token expired" }, { status: 401 });
      customerId = payload.userId;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Verify booking belongs to this customer
    const [booking] = await sql`
      SELECT pb.id, pb.status, pb.slot_date, pb.slot_window,
             l.latitude AS property_lat, l.longitude AS property_lng
      FROM photography_bookings pb
      JOIN listings l ON l.id = pb.listing_id
      WHERE pb.id = ${bookingId}
        AND pb.customer_id = ${customerId}
      LIMIT 1
    `;

    if (!booking) {
      return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
    }

    // Only return live location when en_route
    if (booking.status !== "en_route") {
      return NextResponse.json({
        success: true,
        status: booking.status,
        shutterbugLocation: null,
        etaMinutes: null,
      });
    }

    // Fetch latest location from Redis
    let shutterbugLocation: { lat: number; lng: number; heading: number; speed: number; ts: number } | null = null;
    if (redis) {
      try {
        const raw = await redis.get<string>(`location:${bookingId}`);
        if (raw) shutterbugLocation = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch (e) {
        console.warn("[track] Redis read failed:", e);
      }
    }

    // Compute ETA via Mapbox Directions API (straight-line fallback if no token)
    let etaMinutes: number | null = null;
    if (shutterbugLocation && booking.property_lat && booking.property_lng) {
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (mapboxToken) {
        try {
          const origin = `${shutterbugLocation.lng},${shutterbugLocation.lat}`;
          const dest = `${booking.property_lng},${booking.property_lat}`;
          const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin};${dest}?access_token=${mapboxToken}`;
          const res = await fetch(url, { next: { revalidate: 0 } });
          if (res.ok) {
            const data = await res.json();
            const durationSec: number = data?.routes?.[0]?.duration ?? null;
            if (durationSec != null) etaMinutes = Math.ceil(durationSec / 60);
          }
        } catch (e) {
          console.warn("[track] Mapbox directions failed:", e);
          // Fallback: straight-line distance / 30km/h
          const R = 6371;
          const dLat = ((booking.property_lat - shutterbugLocation.lat) * Math.PI) / 180;
          const dLng = ((booking.property_lng - shutterbugLocation.lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((shutterbugLocation.lat * Math.PI) / 180) *
              Math.cos((booking.property_lat * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          etaMinutes = Math.ceil((distKm / 30) * 60);
        }
      }
    }

    return NextResponse.json({
      success: true,
      status: booking.status,
      shutterbugLocation,
      etaMinutes,
      propertyLocation: {
        lat: booking.property_lat,
        lng: booking.property_lng,
      },
    });
  } catch (err: any) {
    console.error("[track] error:", err);
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}
