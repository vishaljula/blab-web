import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

/**
 * GET /api/shutterbug/jobs
 *
 * Returns the list of assigned photography bookings for the authenticated shutterbug.
 * Includes property address and customer contact details (decrypted for display).
 * Filters: pending, confirmed, en_route (not completed/cancelled/no_show).
 */
export async function GET(request: Request) {
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

    const sql = neon(process.env.DATABASE_URL!);

    // Verify this user is actually a shutterbug
    const [sbUser] = await sql`
      SELECT id FROM users WHERE id = ${shutterbugId} AND role = 'shutterbug' LIMIT 1
    `;
    if (!sbUser) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const bookings = await sql`
      SELECT
        pb.id,
        pb.slot_date,
        pb.slot_window,
        pb.status,
        pb.customer_notes,
        l.address AS property_address,
        l.latitude AS property_lat,
        l.longitude AS property_lng,
        cu.encrypted_name AS customer_encrypted_name,
        cu.encrypted_phone AS customer_encrypted_phone
      FROM photography_bookings pb
      JOIN listings l ON l.id = pb.listing_id
      JOIN users cu ON cu.id = pb.customer_id
      WHERE pb.assigned_shutterbug_id = ${shutterbugId}
        AND pb.status IN ('pending', 'confirmed', 'en_route')
        AND pb.slot_date >= CURRENT_DATE::text
      ORDER BY pb.slot_date ASC, pb.slot_window ASC
    `;

    // Return bookings (customer name/phone remain encrypted server-side for now;
    // in Phase 2 add a proper decryption call here)
    return NextResponse.json({
      success: true,
      bookings: bookings.map((b) => ({
        id: b.id,
        slot_date: b.slot_date,
        slot_window: b.slot_window,
        status: b.status,
        customer_notes: b.customer_notes,
        property_address: b.property_address,
        property_lat: b.property_lat,
        property_lng: b.property_lng,
        // Customer contact kept null for MVP1 privacy — admin shares manually
        customer_name: null,
        customer_phone: null,
      })),
    });
  } catch (err: any) {
    console.error("[shutterbug/jobs] error:", err);
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}
