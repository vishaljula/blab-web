import { NextResponse } from "next/server";
import { getLocation, getBookingRoute, setBookingRoute } from "@/lib/location-store";
import { fetchRoadRoute } from "@/app/api/dev/simulate-booking/[id]/route";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";
import { haversineMeters, sha256Hex } from "@/lib/photography-dispatch";

/**
 * GET /api/photography/bookings/[id]/track?t=<optional_keyholder_token>
 *
 * Returns booking lifecycle state, scheduled window, assigned Shutterbug info,
 * and (when en_route and outside the 300m previous-property privacy buffer)
 * the live GPS location + 6-digit Arrival OTP.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const shareToken = searchParams.get("t")?.trim() || null;
    const shareTokenHash = shareToken ? sha256Hex(shareToken) : null;

    const authHeader = request.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "").trim();
    const isDev = process.env.NODE_ENV !== "production";

    let customerId: string | null = null;
    if (bearer) {
      try {
        const decrypted = decrypt(bearer);
        const payload = JSON.parse(decrypted);
        if (payload.userId && payload.expiry >= Date.now()) {
          customerId = payload.userId;
        }
      } catch {
        // ignore invalid bearer if shareToken or isDev is used
      }
    }

    const sql = neon(process.env.DATABASE_URL!);

    const [booking] = await sql`
      SELECT
        pb.id,
        pb.customer_id,
        pb.booker_id,
        pb.status,
        pb.lifecycle_state,
        pb.delivery_state,
        pb.slot_date,
        pb.slot_window,
        pb.service_mode,
        pb.planned_start_at,
        pb.forecast_arrival_at,
        pb.access_mode,
        pb.onsite_name,
        pb.arrival_otp,
        pb.tracking_token_hash,
        pb.tracking_token_expires,
        pb.assigned_shutterbug_id,
        sp.display_name AS shutterbug_name,
        l.latitude AS property_lat,
        l.longitude AS property_lng,
        l.address AS property_address,
        l.property_type AS property_type
      FROM photography_bookings pb
      JOIN listings l ON l.id = pb.listing_id
      LEFT JOIN shutterbug_profiles sp ON sp.user_id = pb.assigned_shutterbug_id
      WHERE pb.id = ${bookingId}::uuid
      LIMIT 1
    `;

    if (!booking) {
      return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
    }

    // Authorization check: Owner/Booker OR valid unexpired Keyholder Token OR Dev Mode
    const isOwner =
      customerId !== null &&
      (booking.customer_id === customerId || booking.booker_id === customerId);
    const isValidShareToken =
      shareTokenHash !== null &&
      booking.tracking_token_hash === shareTokenHash &&
      (!booking.tracking_token_expires ||
        new Date(booking.tracking_token_expires).getTime() > Date.now());

    if (!isOwner && !isValidShareToken && !isDev) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const propLat = Number(booking.property_lat);
    const propLng = Number(booking.property_lng);
    const effectiveState = booking.lifecycle_state || booking.status;
    const isEnRoute = booking.status === "en_route" || effectiveState === "en_route";
    const isArrived = booking.status === "arrived" || effectiveState === "arrived";

    // Reveal Arrival OTP only during en_route / arrived (and when not an unattended plot)
    const showOtp =
      !["completed", "cancelled", "shooting", "uploading"].includes(effectiveState) &&
      booking.access_mode !== "open_plot_no_key"
        ? (booking.arrival_otp ?? null)
        : null;

    const headers = {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Referrer-Policy": "no-referrer",
    };

    // Never expose live GPS unless the booking is actively en_route
    if (!isEnRoute) {
      return NextResponse.json(
        {
          success: true,
          status: booking.status,
          lifecycleState: effectiveState,
          deliveryState: booking.delivery_state ?? "pending",
          slotDate: booking.slot_date,
          slotWindow: booking.slot_window,
          plannedStartAt: booking.planned_start_at,
          forecastArrivalAt: booking.forecast_arrival_at,
          shutterbugName: booking.shutterbug_name ?? "Blab Shutterbug",
          accessMode: booking.access_mode ?? "booker_present",
          onsiteName: booking.onsite_name ?? null,
          arrivalOtp: showOtp,
          shutterbugLocation: null,
          etaMinutes: null,
          propertyLocation: propLat && propLng ? { lat: propLat, lng: propLng } : null,
          propertyAddress: booking.property_address ?? null,
          propertyType: booking.property_type ?? null,
        },
        { headers }
      );
    }

    // Fetch latest location and cached road route from Redis in parallel
    let [shutterbugLocation, cachedRoute] = await Promise.all([
      getLocation(bookingId),
      getBookingRoute(bookingId),
    ]);
    let privacySuppressed = false;

    // 300m Previous-Customer Property Privacy Buffer:
    // If the Shutterbug just finished a previous visit today, suppress exact coordinates
    // while they are still within 300m of that previous private property.
    if (shutterbugLocation && booking.assigned_shutterbug_id) {
      const [prevVisit] = await sql`
        SELECT ST_Y(point::geometry) AS lat, ST_X(point::geometry) AS lng
        FROM photography_allocations
        WHERE shutterbug_id = ${booking.assigned_shutterbug_id}::uuid
          AND booking_id IS DISTINCT FROM ${bookingId}::uuid
          AND status = 'finished'
          AND actual_finished_at >= clock_timestamp() - interval '3 hours'
        ORDER BY actual_finished_at DESC
        LIMIT 1
      `;
      if (prevVisit && typeof prevVisit.lat === "number" && typeof prevVisit.lng === "number") {
        const distFromPrevM = haversineMeters(
          shutterbugLocation.lat,
          shutterbugLocation.lng,
          prevVisit.lat,
          prevVisit.lng
        );
        // Only suppress if the two properties aren't themselves next door (<400m apart)
        const distBetweenPropsM = haversineMeters(
          propLat,
          propLng,
          prevVisit.lat,
          prevVisit.lng
        );
        if (distFromPrevM < 300 && distBetweenPropsM > 450) {
          shutterbugLocation = null;
          privacySuppressed = true;
        }
      }
    }

    let etaMinutes: number | null = null;
    if (shutterbugLocation && propLat && propLng) {
      const distKm =
        haversineMeters(shutterbugLocation.lat, shutterbugLocation.lng, propLat, propLng) /
        1000;
      etaMinutes = Math.max(1, Math.ceil((distKm / 24) * 60));

      // If no cached road route exists yet for this active ride, fetch and cache it once on the server
      if (!cachedRoute || cachedRoute.length < 2) {
        cachedRoute = await fetchRoadRoute(
          [shutterbugLocation.lng, shutterbugLocation.lat],
          [propLng, propLat]
        );
        if (cachedRoute.length > 1) {
          setBookingRoute(bookingId, cachedRoute).catch(() => {});
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        status: booking.status,
        lifecycleState: effectiveState,
        deliveryState: booking.delivery_state ?? "pending",
        slotDate: booking.slot_date,
        slotWindow: booking.slot_window,
        plannedStartAt: booking.planned_start_at,
        forecastArrivalAt: booking.forecast_arrival_at,
        shutterbugName: booking.shutterbug_name ?? "Blab Shutterbug",
        accessMode: booking.access_mode ?? "booker_present",
        onsiteName: booking.onsite_name ?? null,
        arrivalOtp: showOtp,
        privacySuppressed,
        shutterbugLocation,
        route: privacySuppressed ? null : cachedRoute,
        etaMinutes,
        propertyLocation: propLat && propLng ? { lat: propLat, lng: propLng } : null,
        propertyAddress: booking.property_address ?? null,
        propertyType: booking.property_type ?? null,
      },
      { headers }
    );
  } catch (err: any) {
    console.error("[track] error:", err);
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
