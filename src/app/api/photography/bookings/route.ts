import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { auth } from "@/auth";
import { decrypt } from "@/lib/crypto";
import { runSimulation } from "@/app/api/dev/simulate-booking/[id]/route";
import {
  buildAvailabilityResponse,
  fetchMapboxDriveMinutes,
  findBestInsertionForShift,
  generateArrivalOtp,
  generateTrackingToken,
  getDaylightCutoffUtc,
  getDurationProfile,
  istToUtcDate,
  loadShiftsAndAllocations,
  sha256Hex,
  type TimeWindowConfig,
} from "@/lib/photography-dispatch";

async function resolveUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (token) {
    try {
      const decrypted = decrypt(token);
      const payload = JSON.parse(decrypted);
      if (payload.userId && payload.expiry > Date.now()) {
        return payload.userId as string;
      }
    } catch {
      // fall through to NextAuth session check
    }
  }
  try {
    const session = await auth();
    if ((session?.user as any)?.id) return (session!.user as any).id as string;
  } catch {
    // ignore
  }
  return null;
}

/**
 * POST /api/photography/bookings
 *
 * Route-aware, shift-locked booking reservation:
 *  - Evaluates candidate shifts for the requested window (or Express immediate slot)
 *  - Verifies real road travel time via Mapbox Directions outside the DB lock
 *  - Commits atomically via sequential PL/pgSQL `reserve_photography_visit` with
 *    optimistic `route_version` + neighbor-ID verification and bounded 3-attempt retry
 *  - On 409 slot_full, piggybacks fresh `availability` in the same response
 */
export async function POST(request: Request) {
  try {
    const customerId = await resolveUserId(request);
    if (!customerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      listingId,
      slotDate,
      slotWindow,
      serviceMode = slotWindow === "E" ? "express" : "scheduled",
      accessMode = "booker_present",
      onsiteName = null,
      onsitePhone = null,
      unitCount = 1,
      customerNotes = null,
      propertyH3Cell = null,
      bookingSource = "organic",
      idempotencyKey: clientIdemKey,
    } = body;

    if (!listingId || !slotDate || !slotWindow) {
      return NextResponse.json(
        { success: false, error: "listingId, slotDate, and slotWindow are required" },
        { status: 400 }
      );
    }

    if (!["A", "B", "C", "D", "E"].includes(slotWindow)) {
      return NextResponse.json({ success: false, error: "Invalid slot window" }, { status: 400 });
    }

    if (!["booker_present", "onsite_contact", "open_plot_no_key"].includes(accessMode)) {
      return NextResponse.json({ success: false, error: "Invalid accessMode" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // 1. Load listing coordinates & property type
    const [listing] = await sql`
      SELECT id, latitude, longitude, property_type,
             h3_lat_lng_to_cell(point(latitude, longitude), 7)::text AS h3_cell
      FROM listings
      WHERE id = ${listingId}::uuid
      LIMIT 1
    `;
    if (!listing || typeof listing.latitude !== "number" || typeof listing.longitude !== "number") {
      return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
    }

    const propLat = Number(listing.latitude);
    const propLng = Number(listing.longitude);
    const resolvedH3 = propertyH3Cell || listing.h3_cell;
    const duration = getDurationProfile(listing.property_type, unitCount);
    const daylightCutoff = getDaylightCutoffUtc(slotDate, propLat, propLng);

    // 2. Load service_config to determine arrival window bounds
    const [cfg] = await sql`
      SELECT time_windows, min_lead_time_hours
      FROM service_config
      WHERE id = 'default'
    `;
    const windows: TimeWindowConfig[] = (cfg?.time_windows as any) ?? [];
    const now = new Date();

    let winStart: Date;
    let winEnd: Date;
    if (serviceMode === "express" || slotWindow === "E") {
      winStart = new Date(Math.ceil((now.getTime() + 20 * 60_000) / (15 * 60_000)) * (15 * 60_000));
      winEnd = new Date(winStart.getTime() + 45 * 60_000);
    } else {
      const w = windows.find((x) => x.id === slotWindow);
      if (!w) {
        return NextResponse.json({ success: false, error: "Window not configured" }, { status: 400 });
      }
      const rawStart = istToUtcDate(slotDate, w.startHour, w.startMin);
      winEnd = istToUtcDate(slotDate, w.endHour, w.endMin);
      const minLeadMs = (cfg?.min_lead_time_hours ?? 2) * 3600_000;
      const earliestMs = Math.max(
        rawStart.getTime(),
        Math.ceil((now.getTime() + minLeadMs) / (15 * 60_000)) * (15 * 60_000)
      );
      winStart = new Date(earliestMs);
    }

    if (winStart.getTime() > winEnd.getTime()) {
      const freshAvailability = await buildAvailabilityResponse(sql, {
        lat: propLat,
        lng: propLng,
        propertyType: listing.property_type,
        unitCount,
      });
      return NextResponse.json(
        {
          success: false,
          error: "slot_full",
          message: "This window has already closed. Please pick another time.",
          availability: freshAvailability,
        },
        { status: 409 }
      );
    }

    const idempotencyKey =
      clientIdemKey || `book:${customerId}:${listingId}:${slotDate}:${slotWindow}`;
    const requestHash = sha256Hex(
      JSON.stringify({ listingId, slotDate, slotWindow, serviceMode, unitCount })
    );

    // 3. Check if an idempotent booking row already exists for this key
    const [existingBooking] = await sql`
      SELECT id, request_hash, assigned_shutterbug_id, planned_start_at, arrival_otp
      FROM photography_bookings
      WHERE idempotency_key = ${idempotencyKey}
      LIMIT 1
    `;
    if (existingBooking) {
      if (existingBooking.request_hash && existingBooking.request_hash !== requestHash) {
        return NextResponse.json(
          { success: false, error: "Idempotency key reused with different parameters" },
          { status: 422 }
        );
      }
      const { token: freshShareToken, tokenHash: freshShareHash } = generateTrackingToken();
      await sql`
        UPDATE photography_bookings
           SET tracking_token_hash = ${freshShareHash}
         WHERE id = ${existingBooking.id}::uuid
      `;
      return NextResponse.json({
        success: true,
        bookingId: existingBooking.id,
        trackingToken: freshShareToken,
        arrivalOtp: existingBooking.arrival_otp,
        plannedStartAt: existingBooking.planned_start_at,
        assignedShutterbugId: existingBooking.assigned_shutterbug_id,
      });
    }

    // 4. Generate tracking token (256-bit) & 6-digit arrival OTP
    const { token: trackingToken, tokenHash: trackingTokenHash } = generateTrackingToken();
    const { otp: arrivalOtp, otpHash: arrivalOtpHash } = generateArrivalOtp();
    const tokenExpiresAt = new Date(winEnd.getTime() + 6 * 3600_000);

    // Create the booking row prior to running the shift reservation loop
    const [createdBooking] = await sql`
      INSERT INTO photography_bookings (
        listing_id, customer_id, booker_id, slot_date, slot_window,
        service_mode, status, lifecycle_state,
        property_point, access_point, property_h3_cell,
        arrival_window_start, arrival_window_end, daylight_cutoff_at,
        onsite_minutes, exterior_minutes, setup_minutes,
        access_mode, onsite_name, onsite_phone_e164,
        tracking_token_hash, tracking_token_expires,
        arrival_otp, arrival_otp_hash,
        customer_notes, booking_source
      ) VALUES (
        ${listingId}::uuid, ${customerId}::uuid, ${customerId}::uuid, ${slotDate}, ${slotWindow},
        ${serviceMode}, 'pending', 'booked',
        ST_SetSRID(ST_MakePoint(${propLng}, ${propLat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${propLng}, ${propLat}), 4326)::geography,
        ${resolvedH3},
        ${winStart.toISOString()}::timestamptz,
        ${winEnd.toISOString()}::timestamptz,
        ${daylightCutoff.toISOString()}::timestamptz,
        ${duration.onsiteMinutes}, ${duration.exteriorMinutes}, ${duration.setupMinutes},
        ${accessMode}, ${onsiteName}, ${onsitePhone},
        ${trackingTokenHash}, ${tokenExpiresAt.toISOString()}::timestamptz,
        ${arrivalOtp}, ${arrivalOtpHash},
        ${customerNotes}, ${bookingSource}
      )
      RETURNING id
    `;

    const bookingId = createdBooking.id as string;
    const allocStatus = "committed";

    // 5. Bounded 3-Attempt Reservation Loop with Mapbox road validation + route_version check
    let reserved = false;
    let winningCandidate: {
      shutterbugId: string;
      candStart: Date;
    } | null = null;

    for (let attempt = 1; attempt <= 3 && !reserved; attempt++) {
      const { shifts, allocationsByShift } = await loadShiftsAndAllocations(sql, [slotDate]);

      // Build feasible candidates across all shifts for this date
      const candidates = [];
      for (const shift of shifts) {
        const allocs = allocationsByShift.get(shift.id) ?? [];
        const ins = findBestInsertionForShift(
          shift,
          allocs,
          winStart,
          winEnd,
          propLat,
          propLng,
          duration,
          daylightCutoff
        );
        if (ins) {
          candidates.push({ ...ins, existingCount: allocs.length });
        }
      }

      // Sort by lowest added travel minutes, then lowest workload today, then highest reliability
      candidates.sort((a, b) => {
        if (a.addedTravelMins !== b.addedTravelMins) return a.addedTravelMins - b.addedTravelMins;
        if (a.existingCount !== b.existingCount) return a.existingCount - b.existingCount;
        return b.shift.reliability_score - a.shift.reliability_score;
      });

      if (candidates.length === 0) break;

      for (const cand of candidates) {
        const prevLat = cand.prevAlloc ? cand.prevAlloc.lat : cand.shift.start_lat;
        const prevLng = cand.prevAlloc ? cand.prevAlloc.lng : cand.shift.start_lng;
        const nextLat = cand.nextAlloc ? cand.nextAlloc.lat : cand.shift.end_lat;
        const nextLng = cand.nextAlloc ? cand.nextAlloc.lng : cand.shift.end_lng;

        // Verify road travel minutes via Mapbox Directions OUTSIDE the DB lock
        const [roadFromPrev, roadToNext] = await Promise.all([
          fetchMapboxDriveMinutes(prevLat, prevLng, propLat, propLng),
          fetchMapboxDriveMinutes(propLat, propLng, nextLat, nextLng),
        ]);

        // Call sequential PL/pgSQL reservation function
        const [resRow] = await sql`
          SELECT * FROM reserve_photography_visit(
            ${bookingId}::uuid,
            ${customerId}::uuid,
            ${idempotencyKey},
            ${requestHash},
            ${cand.shift.id}::uuid,
            ${cand.shift.route_version}::integer,
            ${cand.prevAlloc ? cand.prevAlloc.id : null}::uuid,
            ${cand.nextAlloc ? cand.nextAlloc.id : null}::uuid,
            ${allocStatus},
            ${null}::integer,
            ${cand.candStart.toISOString()}::timestamptz,
            ${roadFromPrev}::integer,
            ${roadToNext}::integer
          )
        `;

        if (resRow?.ok) {
          reserved = true;
          winningCandidate = {
            shutterbugId: cand.shift.shutterbug_id,
            candStart: cand.candStart,
          };
          break;
        }

        // If contention changed the shift's route_version or neighbors, break to outer retry loop
        if (
          resRow?.error_code === "ROUTE_VERSION_MISMATCH" ||
          resRow?.error_code === "NEIGHBOR_CHANGED"
        ) {
          break;
        }
      }
    }

    if (!reserved || !winningCandidate) {
      // Clean up the unallocated booking row and return 409 with fresh availability piggybacked
      await sql`DELETE FROM photography_bookings WHERE id = ${bookingId}::uuid`;
      const freshAvailability = await buildAvailabilityResponse(sql, {
        lat: propLat,
        lng: propLng,
        propertyType: listing.property_type,
        unitCount,
      });
      return NextResponse.json(
        {
          success: false,
          error: "slot_full",
          message: "This slot just filled up! Please select an updated time below.",
          availability: freshAvailability,
        },
        { status: 409 }
      );
    }

    // 6. If Express Shoot ('E'), immediately dispatch the Shutterbug (status = 'en_route')
    //    and start the live road-route GPS stream in dev/demo mode so the 3D scooter is already riding.
    const isExpress = serviceMode === "express" || slotWindow === "E";
    let initialTrack: any = null;
    if (isExpress) {
      await sql`
        UPDATE photography_bookings
        SET status = 'en_route',
            lifecycle_state = 'en_route',
            travel_started_at = NOW(),
            tracking_started_at = NOW(),
            updated_at = NOW()
        WHERE id = ${bookingId}::uuid
      `;
      await sql`
        UPDATE photography_allocations
        SET status = 'en_route',
            updated_at = NOW()
        WHERE booking_id = ${bookingId}::uuid
      `;
      if (process.env.NODE_ENV !== "production") {
        try {
          const { route, initialLocation } = await runSimulation(bookingId, propLat, propLng);
          initialTrack = {
            status: "en_route",
            lifecycleState: "en_route",
            arrivalOtp,
            route,
            shutterbugLocation: initialLocation,
            propertyLocation: { lat: propLat, lng: propLng },
            propertyType: listing.property_type ?? null,
          };
        } catch (e) {
          console.error("[photography/bookings] Express simulation error:", e);
        }
      }
    }

    // 7. Record payment_orders row (₹999 base with 100% Launch Promo discount = ₹0 payable)
    await sql`
      INSERT INTO payment_orders (
        user_id, listing_id, booking_id, order_type, base_amount_inr, discount_inr, payable_inr, promo_code, status
      ) VALUES (
        ${customerId}::uuid, ${listingId}::uuid, ${bookingId}::uuid, 'photography_shoot', 999, 999, 0, 'LAUNCH_FREE_3M', 'paid'
      )
    `.catch((e) => console.warn("[photography/bookings] payment_orders insert warning:", e));

    // 8. Fast-path outbox notification dispatch (with atomic claim)
    flushBookingOutbox(sql, bookingId, slotDate, slotWindow).catch((e) =>
      console.warn("[photography/bookings] outbox fast-path warning:", e)
    );

    return NextResponse.json({
      success: true,
      bookingId,
      trackingToken,
      arrivalOtp,
      status: isExpress ? "en_route" : "confirmed",
      lifecycleState: isExpress ? "en_route" : "assigned",
      plannedStartAt: winningCandidate.candStart.toISOString(),
      assignedShutterbugId: winningCandidate.shutterbugId,
      initialTrack,
    });
  } catch (err: any) {
    console.error("[POST /api/photography/bookings] error:", err);
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/photography/bookings?listingId=xxx
 * Returns the active (non-cancelled) booking for a listing.
 */
export async function GET(request: Request) {
  try {
    const customerId = await resolveUserId(request);
    if (!customerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");
    if (!listingId) {
      return NextResponse.json({ success: false, error: "listingId required" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const [booking] = await sql`
      SELECT pb.id, pb.slot_date, pb.slot_window, pb.status, pb.lifecycle_state,
             pb.planned_start_at, pb.forecast_arrival_at, pb.access_mode,
             pb.onsite_name, pb.onsite_phone_e164, pb.customer_notes,
             pb.assigned_shutterbug_id,
             sp.display_name AS shutterbug_name,
             u.photo_url AS shutterbug_photo
      FROM photography_bookings pb
      LEFT JOIN users u ON u.id = pb.assigned_shutterbug_id
      LEFT JOIN shutterbug_profiles sp ON sp.user_id = pb.assigned_shutterbug_id
      WHERE pb.listing_id = ${listingId}::uuid
        AND pb.customer_id = ${customerId}::uuid
        AND pb.status != 'cancelled'
      ORDER BY pb.created_at DESC
      LIMIT 1
    `;

    return NextResponse.json({ success: true, booking: booking ?? null });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}

// ── Outbox Claim & Push Helper ───────────────────────────────────────────────

const WINDOW_LABELS: Record<string, string> = {
  A: "Morning (9 AM – 12 PM)",
  B: "Midday (12 PM – 3 PM)",
  C: "Afternoon (3 PM – 5:30 PM)",
  D: "Evening",
  E: "Express Shoot",
};

async function flushBookingOutbox(
  sql: any,
  bookingId: string,
  slotDate: string,
  slotWindow: string
) {
  const lockOwner = `api:${Date.now()}`;
  const claimed = await sql`
    UPDATE photography_outbox
       SET locked_until = clock_timestamp() + interval '15 seconds',
           lock_owner = ${lockOwner},
           attempts = attempts + 1
     WHERE booking_id = ${bookingId}::uuid
       AND status = 'pending'
       AND (locked_until IS NULL OR locked_until <= clock_timestamp())
    RETURNING id, target_user_id, event_type
  `;
  if (!claimed.length) return;

  for (const row of claimed) {
    try {
      const [u] = await sql`
        SELECT push_token FROM users WHERE id = ${row.target_user_id}::uuid LIMIT 1
      `;
      if (u?.push_token && !String(u.push_token).includes("TEST_")) {
        const label = WINDOW_LABELS[slotWindow] ?? slotWindow;
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            to: u.push_token,
            sound: "default",
            title: "📸 New Shoot Assigned!",
            body: `${slotDate} · ${label} — tap to view in your Up Next queue`,
            data: { bookingId, screen: "shutterbug-job" },
          }),
        });
      }
      await sql`
        UPDATE photography_outbox
           SET status = 'sent', locked_until = NULL
         WHERE id = ${row.id}::uuid AND lock_owner = ${lockOwner}
      `;
    } catch (err: any) {
      await sql`
        UPDATE photography_outbox
           SET last_error = ${err?.message ?? "push error"},
               next_attempt_at = clock_timestamp() + interval '30 seconds',
               locked_until = NULL
         WHERE id = ${row.id}::uuid AND lock_owner = ${lockOwner}
      `;
    }
  }
}
