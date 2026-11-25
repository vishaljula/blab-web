import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { runSimulation } from "@/app/api/dev/simulate-booking/[id]/route";

/**
 * POST /api/dev/quick-simulate
 *
 * DEV ONLY — 1-tap tracking simulation shortcut.
 * Optional body: { lat?: number, lng?: number, address?: string }
 *
 * If lat/lng are provided (e.g., from map search or current pin), updates/uses the latest
 * test booking's listing coordinates so the destination is that exact address, then
 * triggers /api/dev/simulate-booking/[id] and returns { success: true, bookingId }.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const customLat = typeof body.lat === "number" && isFinite(body.lat) ? body.lat : null;
    const customLng = typeof body.lng === "number" && isFinite(body.lng) ? body.lng : null;
    const customAddress = typeof body.address === "string" && body.address.trim() ? body.address.trim() : null;

    const sql = neon(process.env.DATABASE_URL!);

    // Find the most recent booking with a valid listing
    let [booking] = await sql`
      SELECT pb.id, pb.listing_id, pb.arrival_otp,
             sp.display_name AS shutterbug_name,
             l.latitude, l.longitude, l.address, l.property_type
      FROM photography_bookings pb
      JOIN listings l ON l.id = pb.listing_id
      LEFT JOIN shutterbug_profiles sp ON sp.user_id = pb.assigned_shutterbug_id
      ORDER BY pb.created_at DESC
      LIMIT 1
    `;

    if (!booking) {
      // Create a booking on the most recent listing if none exists
      const [listing] = await sql`
        SELECT id, lister_id, latitude, longitude, address, property_type
        FROM listings
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND lister_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (!listing) {
        return NextResponse.json({ success: false, error: "No listings found in DB" }, { status: 400 });
      }
      const [created] = await sql`
        INSERT INTO photography_bookings (
          listing_id, customer_id, slot_date, slot_window, status, lifecycle_state, arrival_otp, booking_source
        ) VALUES (
          ${listing.id}, ${listing.lister_id}, CURRENT_DATE, 'A', 'en_route', 'en_route', '482910', 'organic'
        )
        RETURNING id, listing_id, arrival_otp
      `;
      booking = {
        id: created.id,
        listing_id: created.listing_id,
        arrival_otp: created.arrival_otp,
        shutterbug_name: "Rahul K. (Shutterbug)",
        latitude: listing.latitude,
        longitude: listing.longitude,
        address: listing.address,
        property_type: listing.property_type,
      };
    }

    // If caller passed custom destination coordinates/address, update the booking's listing
    if (customLat && customLng) {
      await sql`
        UPDATE listings
        SET latitude = ${customLat},
            longitude = ${customLng},
            address = COALESCE(${customAddress}, address)
        WHERE id = ${booking.listing_id}
      `;
    }

    const destLat = customLat ?? Number(booking.latitude);
    const destLng = customLng ?? Number(booking.longitude);
    const destAddress = customAddress ?? booking.address ?? null;

    // Await initial en_route DB state + Mapbox road route + first Redis GPS ping before returning
    const { route, initialLocation } = await runSimulation(booking.id, destLat, destLng);

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      destination: {
        lat: destLat,
        lng: destLng,
        address: destAddress,
      },
      initialTrack: {
        status: "en_route",
        lifecycleState: "en_route",
        shutterbugName: booking.shutterbug_name ?? "Rahul K. (Shutterbug)",
        arrivalOtp: booking.arrival_otp ?? "482910",
        shutterbugLocation: initialLocation,
        route,
        etaMinutes: 2,
        propertyLocation: { lat: destLat, lng: destLng },
        propertyAddress: destAddress,
        propertyType: booking.property_type ?? null,
      },
    });
  } catch (err: any) {
    console.error("[quick-simulate] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to start quick simulation" },
      { status: 500 }
    );
  }
}

