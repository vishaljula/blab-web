import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

/**
 * POST /api/photography/waitlist
 *
 * Captures a request from a customer whose property is outside the service zone.
 * Computes queue position within their H3 cell and stores the entry.
 *
 * Body: { listingId?, propertyAddress, propertyLat, propertyLng, propertyH3Cell }
 * Auth: Bearer token
 */
export async function POST(request: Request) {
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

    const body = await request.json();
    const { listingId, propertyAddress, propertyLat, propertyLng, propertyH3Cell } = body;

    if (!propertyLat || !propertyLng) {
      return NextResponse.json({ success: false, error: "Property coordinates required" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Check if this customer+listing already has a waitlist entry
    const [existing] = await sql`
      SELECT id FROM photography_waitlist
      WHERE customer_id = ${customerId}
        AND listing_id ${listingId ? sql`= ${listingId}::uuid` : sql`IS NULL`}
        AND status = 'waiting'
      LIMIT 1
    `;
    if (existing) {
      // Return the existing entry — idempotent
      const [entry] = await sql`
        SELECT id, queue_position FROM photography_waitlist WHERE id = ${existing.id}
      `;
      return NextResponse.json({ success: true, waitlistId: entry.id, queuePosition: entry.queue_position, existing: true });
    }

    // Compute queue position (how many waiting entries in this H3 cell + 1)
    const h3Cell = propertyH3Cell ?? null;
    const [posRow] = await sql`
      SELECT COUNT(*)::int + 1 AS position
      FROM photography_waitlist
      WHERE property_h3_cell = ${h3Cell} AND status = 'waiting'
    `;
    const queuePosition: number = posRow?.position ?? 1;

    const [inserted] = await sql`
      INSERT INTO photography_waitlist
        (listing_id, customer_id, property_address, property_lat, property_lng, property_h3_cell, queue_position)
      VALUES (
        ${listingId ? listingId : null}::uuid,
        ${customerId}::uuid,
        ${propertyAddress ?? null},
        ${propertyLat},
        ${propertyLng},
        ${h3Cell},
        ${queuePosition}
      )
      RETURNING id, queue_position
    `;

    return NextResponse.json({
      success: true,
      waitlistId: inserted.id,
      queuePosition: inserted.queue_position,
    });
  } catch (err: any) {
    console.error("[photography/waitlist] error:", err);
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}
