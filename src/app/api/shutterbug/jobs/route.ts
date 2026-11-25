import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

/**
 * GET /api/shutterbug/jobs
 *
 * Returns the ordered queue of assigned photography bookings for the authenticated shutterbug,
 * sorted strictly by planned_start_at so the Shutterbug app presents a guided 1-by-1 queue.
 */
export async function GET(request: Request) {
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

    const sql = neon(process.env.DATABASE_URL!);

    const [sbUser] = await sql`
      SELECT id FROM users WHERE id = ${shutterbugId}::uuid AND role = 'shutterbug' LIMIT 1
    `;
    if (!sbUser) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const [profileRow, completedRow, bookings] = await Promise.all([
      sql`
        SELECT display_name, dispatch_enabled
        FROM shutterbug_profiles
        WHERE user_id = ${shutterbugId}::uuid
        LIMIT 1
      `,
      sql`
        SELECT COUNT(*)::int AS cnt
        FROM photography_bookings
        WHERE assigned_shutterbug_id = ${shutterbugId}::uuid
          AND status = 'completed'
          AND slot_date = CURRENT_DATE::text
      `,
      sql`
        SELECT
          pb.id,
          pb.slot_date,
          pb.slot_window,
          pb.status,
          pb.lifecycle_state,
          pb.delivery_state,
          pb.planned_start_at,
          pb.onsite_minutes,
          pb.access_mode,
          pb.onsite_name,
          pb.onsite_phone_e164,
          pb.arrival_otp,
          pb.customer_notes,
          l.address AS property_address,
          l.latitude AS property_lat,
          l.longitude AS property_lng,
          l.property_type AS property_type
        FROM photography_bookings pb
        JOIN listings l ON l.id = pb.listing_id
        WHERE pb.assigned_shutterbug_id = ${shutterbugId}::uuid
          AND pb.status NOT IN ('completed', 'cancelled', 'no_show')
          AND pb.slot_date >= (CURRENT_DATE - interval '1 day')::date::text
        ORDER BY COALESCE(pb.planned_start_at, NOW()) ASC, pb.slot_date ASC, pb.slot_window ASC
      `,
    ]);

    return NextResponse.json({
      success: true,
      profile: {
        displayName: profileRow[0]?.display_name ?? "Blab Shutterbug",
        dispatchEnabled: profileRow[0]?.dispatch_enabled ?? true,
        completedToday: completedRow[0]?.cnt ?? 0,
      },
      bookings: bookings.map((b, idx) => ({
        id: b.id,
        queue_rank: idx + 1,
        is_up_next: idx === 0,
        slot_date: b.slot_date,
        slot_window: b.slot_window,
        status: b.status,
        lifecycle_state: b.lifecycle_state ?? b.status,
        delivery_state: b.delivery_state ?? "pending",
        planned_start_at: b.planned_start_at,
        onsite_minutes: b.onsite_minutes ?? 50,
        access_mode: b.access_mode ?? "booker_present",
        onsite_name: b.onsite_name ?? null,
        onsite_phone: b.onsite_phone_e164 ?? null,
        arrival_otp: b.arrival_otp ?? null,
        customer_notes: b.customer_notes,
        property_address: b.property_address,
        property_lat: b.property_lat,
        property_lng: b.property_lng,
        property_type: b.property_type,
      })),
    });
  } catch (err: any) {
    console.error("[shutterbug/jobs] error:", err);
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const payload = JSON.parse(decrypt(token));
    if (!payload.userId || payload.expiry < Date.now()) {
      return NextResponse.json({ success: false, error: "Token expired" }, { status: 401 });
    }
    const body = await request.json();
    const dispatchEnabled = Boolean(body.dispatchEnabled);
    const sql = neon(process.env.DATABASE_URL!);

    await sql`
      INSERT INTO shutterbug_profiles (user_id, display_name, dispatch_enabled)
      VALUES (${payload.userId}::uuid, 'Blab Shutterbug', ${dispatchEnabled})
      ON CONFLICT (user_id) DO UPDATE
      SET dispatch_enabled = ${dispatchEnabled}, updated_at = NOW()
    `;
    return NextResponse.json({ success: true, dispatchEnabled });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}
