import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { decrypt } from "@/lib/crypto";

const LOCATION_TTL_SECONDS = 7200; // 2 hours — clears automatically after shift

/**
 * POST /api/shutterbug/location
 *
 * Called by the Shutterbug app every 10 seconds when "en route".
 * Stores latest position in Redis (keyed by booking ID).
 * Also updates the booking status to 'en_route' on first call.
 *
 * Body: { bookingId, lat, lng, heading, speed? }
 * Auth: Bearer token (must belong to the assigned shutterbug)
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    let shutterbugId: string;
    try {
      const decrypted = decrypt(token);
      const payload = JSON.parse(decrypted);
      if (!payload.userId || payload.expiry < Date.now())
        return NextResponse.json({ success: false, error: "Token expired" }, { status: 401 });
      shutterbugId = payload.userId;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });
    }

    const { bookingId, lat, lng, heading, speed } = await request.json();

    if (!bookingId || lat == null || lng == null) {
      return NextResponse.json({ success: false, error: "bookingId, lat, lng required" }, { status: 400 });
    }

    // Store in Redis — fail gracefully if Redis unavailable
    if (redis) {
      try {
        await redis.set(
          `location:${bookingId}`,
          JSON.stringify({ lat, lng, heading: heading ?? 0, speed: speed ?? 0, ts: Date.now() }),
          { ex: LOCATION_TTL_SECONDS }
        );
      } catch (redisErr) {
        console.warn("[shutterbug/location] Redis write failed:", redisErr);
      }
    }

    // Update booking status to en_route on first location ping (idempotent SET)
    // We do this in-band so the customer's tracking screen can show the map.
    // Using neon inline to avoid circular import issues.
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      UPDATE photography_bookings
      SET status = 'en_route', updated_at = NOW()
      WHERE id = ${bookingId}
        AND assigned_shutterbug_id = ${shutterbugId}
        AND status IN ('confirmed', 'en_route')
    `;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[shutterbug/location] error:", err);
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}
