import { NextResponse } from "next/server";
import { setLocation, setShutterbugLocation } from "@/lib/location-store";
import { decrypt } from "@/lib/crypto";
import { neon } from "@neondatabase/serverless";

/**
 * POST /api/shutterbug/location
 *
 * Called by the Shutterbug app while "en route".
 * Stores latest position in Redis + dev memory (keyed by bookingId & shutterbugId).
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let shutterbugId: string;
    try {
      const decrypted = decrypt(token);
      const payload = JSON.parse(decrypted);
      if (!payload.userId || payload.expiry < Date.now()) {
        return NextResponse.json({ success: false, error: "Token expired" }, { status: 401 });
      }
      shutterbugId = payload.userId;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });
    }

    const { bookingId, lat, lng, heading, speed } = await request.json();

    if (!bookingId || lat == null || lng == null) {
      return NextResponse.json(
        { success: false, error: "bookingId, lat, lng required" },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Verify booking is assigned to this shutterbug and is allowed to stream location
    const [updated] = await sql`
      UPDATE photography_bookings
      SET status = CASE WHEN status IN ('pending', 'confirmed') THEN 'en_route' ELSE status END,
          lifecycle_state = CASE WHEN lifecycle_state IN ('booked', 'assigned') THEN 'en_route' ELSE lifecycle_state END,
          travel_started_at = COALESCE(travel_started_at, NOW()),
          tracking_started_at = COALESCE(tracking_started_at, NOW()),
          updated_at = NOW()
      WHERE id = ${bookingId}::uuid
        AND assigned_shutterbug_id = ${shutterbugId}::uuid
        AND status IN ('pending', 'confirmed', 'en_route')
      RETURNING id
    `;

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Booking not active or not assigned to this shutterbug" },
        { status: 403 }
      );
    }

    const locPayload = {
      lat: Number(lat),
      lng: Number(lng),
      heading: Number(heading ?? 0),
      speed: Number(speed ?? 0),
      ts: Date.now(),
    };

    await Promise.all([
      setLocation(bookingId, locPayload),
      setShutterbugLocation(shutterbugId, locPayload),
    ]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[shutterbug/location] error:", err);
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
