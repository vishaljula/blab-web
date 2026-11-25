import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

/**
 * GET /api/users/my-activity
 *
 * Returns the authenticated user's own listings and photography bookings
 * so they can track their shoots or manage their properties from Profile.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    try {
      const payload = JSON.parse(decrypt(token));
      if (!payload.userId || payload.expiry < Date.now()) {
        return NextResponse.json({ success: false, error: "Token expired" }, { status: 401 });
      }
      userId = payload.userId;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    const [myListings, myShoots] = await Promise.all([
      sql`
        SELECT id, address, city, price, property_type AS "propertyType",
               listing_type AS "listingType", status, image_url AS "imageUrl",
               society_name AS "societyName", created_at AS "createdAt"
        FROM listings
        WHERE lister_id = ${userId}::uuid
        ORDER BY created_at DESC
        LIMIT 20
      `,
      sql`
        SELECT pb.id, pb.listing_id AS "listingId", pb.slot_date AS "slotDate",
               pb.slot_window AS "slotWindow", pb.status, pb.lifecycle_state AS "lifecycleState",
               pb.arrival_otp AS "arrivalOtp", l.address, l.city
        FROM photography_bookings pb
        JOIN listings l ON l.id = pb.listing_id
        WHERE pb.customer_id = ${userId}::uuid
        ORDER BY pb.created_at DESC
        LIMIT 10
      `,
    ]);

    return NextResponse.json({
      success: true,
      myListings,
      myShoots,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}

