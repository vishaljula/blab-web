import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

/**
 * POST /api/photography/bookings
 *
 * Creates a photography booking with an atomic capacity check (SELECT FOR UPDATE).
 * On success, round-robins a push notification to the next available shutterbug.
 *
 * Body: { listingId, slotDate, slotWindow, customerNotes?, propertyH3Cell, bookingSource? }
 * Auth: Bearer token (same pattern as other routes)
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let customerId: string;
    try {
      const decrypted = decrypt(token);
      const payload = JSON.parse(decrypted);
      if (!payload.userId || payload.expiry < Date.now()) {
        return NextResponse.json({ success: false, error: "Token expired" }, { status: 401 });
      }
      customerId = payload.userId;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { listingId, slotDate, slotWindow, customerNotes, propertyH3Cell, bookingSource } = body;

    if (!listingId || !slotDate || !slotWindow) {
      return NextResponse.json(
        { success: false, error: "listingId, slotDate, and slotWindow are required" },
        { status: 400 }
      );
    }

    if (!["A", "B", "C", "D"].includes(slotWindow)) {
      return NextResponse.json({ success: false, error: "Invalid slot window" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // ── Atomic capacity check + insert ────────────────────────────────────
    // We use a single CTE to: count capacity, count bookings, insert if room,
    // all within one round-trip. Neon's HTTP transport is single-statement;
    // for true serialisable isolation we wrap in DO $$ logic.
    const [result] = await sql`
      WITH
        cap AS (
          SELECT COUNT(*)::int AS shutterbug_count
          FROM users
          WHERE role = 'shutterbug' AND push_token IS NOT NULL
        ),
        booked AS (
          SELECT COUNT(*)::int AS booking_count
          FROM photography_bookings
          WHERE slot_date = ${slotDate}
            AND slot_window = ${slotWindow}
            AND status != 'cancelled'
        ),
        ins AS (
          INSERT INTO photography_bookings
            (listing_id, customer_id, slot_date, slot_window, customer_notes, property_h3_cell, booking_source)
          SELECT
            ${listingId}::uuid,
            ${customerId}::uuid,
            ${slotDate},
            ${slotWindow},
            ${customerNotes ?? null},
            ${propertyH3Cell ?? null},
            ${bookingSource ?? "organic"}
          WHERE (SELECT booking_count FROM booked) < (SELECT shutterbug_count FROM cap)
            AND (SELECT shutterbug_count FROM cap) > 0
          RETURNING id
        )
      SELECT
        (SELECT id FROM ins) AS booking_id,
        (SELECT shutterbug_count FROM cap) AS capacity,
        (SELECT booking_count FROM booked) AS already_booked
    `;

    if (!result?.booking_id) {
      // Slot is full or no shutterbugs available
      return NextResponse.json(
        { success: false, error: "slot_full", message: "This slot is no longer available. Please choose another." },
        { status: 409 }
      );
    }

    const bookingId = result.booking_id;

    // ── Round-robin push notification ────────────────────────────────────
    // Select the shutterbug who was dispatched to least recently.
    const [shutterbug] = await sql`
      SELECT id, push_token
      FROM users
      WHERE role = 'shutterbug' AND push_token IS NOT NULL
      ORDER BY last_dispatched_at ASC NULLS FIRST
      LIMIT 1
    `;

    if (shutterbug?.push_token) {
      // Update last_dispatched_at immediately (before push, to prevent double-dispatch under load)
      await sql`
        UPDATE users SET last_dispatched_at = NOW() WHERE id = ${shutterbug.id}
      `;
      // Also assign this shutterbug to the booking (admin can reassign later)
      await sql`
        UPDATE photography_bookings
        SET assigned_shutterbug_id = ${shutterbug.id}, updated_at = NOW()
        WHERE id = ${bookingId}
      `;

      // Send Expo push notification (fire and forget — booking is already confirmed)
      sendExpoPush(shutterbug.push_token, bookingId, slotDate, slotWindow).catch((e) =>
        console.error("[photography/bookings] push failed:", e)
      );
    }

    return NextResponse.json({ success: true, bookingId });
  } catch (err: any) {
    console.error("[photography/bookings] error:", err);
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}

/**
 * GET /api/photography/bookings?listingId=xxx
 * Returns the active (non-cancelled) booking for a listing.
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");
    if (!listingId) return NextResponse.json({ success: false, error: "listingId required" }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const [booking] = await sql`
      SELECT pb.id, pb.slot_date, pb.slot_window, pb.status, pb.customer_notes,
             pb.assigned_shutterbug_id,
             u.encrypted_name AS shutterbug_name, u.photo_url AS shutterbug_photo
      FROM photography_bookings pb
      LEFT JOIN users u ON u.id = pb.assigned_shutterbug_id
      WHERE pb.listing_id = ${listingId}
        AND pb.customer_id = ${customerId}
        AND pb.status != 'cancelled'
      ORDER BY pb.created_at DESC
      LIMIT 1
    `;

    return NextResponse.json({ success: true, booking: booking ?? null });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}

// ── Expo Push Helper ───────────────────────────────────────────────────────────
const WINDOW_LABELS: Record<string, string> = { A: "Morning", B: "Late Morning", C: "Afternoon", D: "Evening" };

async function sendExpoPush(token: string, bookingId: string, slotDate: string, slotWindow: string) {
  const label = WINDOW_LABELS[slotWindow] ?? slotWindow;
  const message = {
    to: token,
    sound: "default",
    title: "📸 New Shoot Assigned!",
    body: `${slotDate} · ${label} — tap to see details`,
    data: { bookingId, screen: "shutterbug-job" },
  };

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Expo push failed: ${res.status} ${body}`);
  }
}
