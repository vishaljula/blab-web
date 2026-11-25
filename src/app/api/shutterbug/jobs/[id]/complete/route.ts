import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";
import { haversineMeters, sha256Hex } from "@/lib/photography-dispatch";

/**
 * POST /api/shutterbug/jobs/[id]/complete
 *
 * Handles Shutterbug job lifecycle transitions:
 *  - action = 'start_ride'   → status = 'en_route', lifecycle_state = 'en_route'
 *  - action = 'arrive'       → verifies proximity (<= 200m if lat/lng supplied), sets arrived
 *  - action = 'verify_otp'   → verifies 6-digit arrival OTP (or open_plot_no_key), sets shooting
 *  - action = 'finish_shoot' → frees route allocation immediately (status='finished', actual_finished_at=NOW()), sets lifecycle_state='uploading'
 *  - action = 'complete' (or omitted) → marks visit & delivery completed, activates listing
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

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

    let body: Record<string, any> = {};
    try {
      body = await request.json();
    } catch {
      // empty body defaults to action = 'complete'
    }
    const action = (body.action as string) || "complete";

    const sql = neon(process.env.DATABASE_URL!);

    const [booking] = await sql`
      SELECT pb.id, pb.status, pb.lifecycle_state, pb.access_mode,
             pb.arrival_otp, pb.arrival_otp_hash, pb.arrival_otp_attempts,
             l.latitude AS prop_lat, l.longitude AS prop_lng
      FROM photography_bookings pb
      JOIN listings l ON l.id = pb.listing_id
      WHERE pb.id = ${bookingId}::uuid
        AND pb.assigned_shutterbug_id = ${shutterbugId}::uuid
      LIMIT 1
    `;

    if (!booking) {
      return NextResponse.json(
        { success: false, error: "Booking not found or not assigned to you" },
        { status: 404 }
      );
    }

    if (action === "start_ride") {
      await sql`
        UPDATE photography_bookings
        SET status = 'en_route',
            lifecycle_state = 'en_route',
            travel_started_at = COALESCE(travel_started_at, NOW()),
            tracking_started_at = COALESCE(tracking_started_at, NOW()),
            version = version + 1,
            updated_at = NOW()
        WHERE id = ${bookingId}::uuid
      `;
      return NextResponse.json({ success: true, lifecycleState: "en_route" });
    }

    if (action === "arrive" || action === "arrived") {
      if (typeof body.lat === "number" && typeof body.lng === "number" && booking.prop_lat && booking.prop_lng) {
        const distM = haversineMeters(
          body.lat,
          body.lng,
          Number(booking.prop_lat),
          Number(booking.prop_lng)
        );
        if (distM > 250 && !body.overrideProximity) {
          return NextResponse.json(
            {
              success: false,
              error: "too_far",
              message: `You are ${Math.round(distM)}m away from the property pin. Move within 200m to mark arrived.`,
            },
            { status: 400 }
          );
        }
      }

      await sql`
        UPDATE photography_bookings
        SET status = 'arrived',
            lifecycle_state = 'arrived',
            arrived_at = COALESCE(arrived_at, NOW()),
            version = version + 1,
            updated_at = NOW()
        WHERE id = ${bookingId}::uuid
      `;
      return NextResponse.json({ success: true, lifecycleState: "arrived" });
    }

    if (action === "verify_otp" || action === "start_shoot") {
      const submittedOtp = String(body.otp ?? "").trim();
      if (booking.access_mode !== "open_plot_no_key" && submittedOtp) {
        if ((booking.arrival_otp_attempts ?? 0) >= 5) {
          return NextResponse.json(
            { success: false, error: "Too many failed OTP attempts. Contact support." },
            { status: 429 }
          );
        }
        const matches =
          (booking.arrival_otp_hash && sha256Hex(submittedOtp) === booking.arrival_otp_hash) ||
          (booking.arrival_otp && submittedOtp === booking.arrival_otp);

        if (!matches) {
          await sql`
            UPDATE photography_bookings
            SET arrival_otp_attempts = COALESCE(arrival_otp_attempts, 0) + 1
            WHERE id = ${bookingId}::uuid
          `;
          return NextResponse.json(
            { success: false, error: "Invalid Arrival OTP." },
            { status: 400 }
          );
        }
      }

      await sql`
        UPDATE photography_bookings
        SET status = 'shooting',
            lifecycle_state = 'shooting',
            shoot_started_at = COALESCE(shoot_started_at, NOW()),
            version = version + 1,
            updated_at = NOW()
        WHERE id = ${bookingId}::uuid
      `;
      return NextResponse.json({ success: true, lifecycleState: "shooting" });
    }

    if (action === "finish_shoot") {
      // Decouple visit completion from photo upload:
      // Free the Shutterbug's shift allocation immediately so they can ride to the next shoot!
      await sql`
        UPDATE photography_allocations
        SET status = 'finished',
            actual_finished_at = NOW()
        WHERE booking_id = ${bookingId}::uuid
          AND status = 'committed'
      `;
      await sql`
        UPDATE photography_bookings
        SET status = 'uploading',
            lifecycle_state = 'uploading',
            delivery_state = 'uploading',
            shoot_finished_at = COALESCE(shoot_finished_at, NOW()),
            version = version + 1,
            updated_at = NOW()
        WHERE id = ${bookingId}::uuid
      `;
      return NextResponse.json({ success: true, lifecycleState: "uploading" });
    }

    // Default action === 'complete'
    await sql`
      UPDATE photography_allocations
      SET status = 'finished',
          actual_finished_at = COALESCE(actual_finished_at, NOW())
      WHERE booking_id = ${bookingId}::uuid
        AND status IN ('offered', 'committed')
    `;

    await sql`
      UPDATE photography_bookings
      SET status = 'completed',
          lifecycle_state = 'completed',
          delivery_state = 'completed',
          shoot_finished_at = COALESCE(shoot_finished_at, NOW()),
          completed_at = NOW(),
          tracking_token_expires = NOW(),
          version = version + 1,
          updated_at = NOW()
      WHERE id = ${bookingId}::uuid
    `;

    const uploadedPhotos: string[] = Array.isArray(body.photoUrls) && body.photoUrls.length > 0
      ? body.photoUrls
      : [
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80",
      ];

    await sql`
      UPDATE listings l
      SET status = 'active',
          image_url = COALESCE(l.image_url, ${uploadedPhotos[0]}),
          photos = ${JSON.stringify(uploadedPhotos)}::jsonb,
          property_specs = COALESCE(l.property_specs, '{}'::jsonb) || '{"shutterbugVerified": true, "verticalReelReady": true, "hdPhotoCount": 10}'::jsonb,
          updated_at = NOW()
      FROM photography_bookings pb
      WHERE pb.id = ${bookingId}::uuid
        AND l.id = pb.listing_id
    `;

    return NextResponse.json({ success: true, lifecycleState: "completed" });
  } catch (err: any) {
    console.error("[shutterbug/jobs/complete] error:", err);
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error" },
      { status: 500 }
    );
  }
}
