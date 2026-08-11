import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * GET /api/photography/availability?lat=17.35&lng=78.55&days=10
 *
 * Returns:
 *  - inServiceZone: boolean
 *  - If true: array of { date, windows: [{ id, label, startHour, startMin, endHour, endMin, available, spotsLeft }] }
 *  - If false: { waitlistZone: { h3Cell, queuePosition } }
 *
 * Capacity per slot = COUNT(active shutterbugs with push_token)
 * Booked = COUNT(photography_bookings for that date+window, status != cancelled)
 * A slot is hidden when startTime is within min_lead_time_hours of now.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");
    const daysParam = parseInt(searchParams.get("days") ?? "10", 10);

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { success: false, error: "lat and lng are required" },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    // ── Load service config ────────────────────────────────────────────────
    const [cfg] = await sql`
      SELECT zone_center_lat, zone_center_lng, zone_radius_km,
             time_windows, min_lead_time_hours, booking_window_days
      FROM service_config WHERE id = 'default'
    `;
    if (!cfg) {
      return NextResponse.json({ success: false, error: "Service config not found" }, { status: 500 });
    }

    const radiusM = cfg.zone_radius_km * 1000;
    const bookingDays = Math.min(daysParam, cfg.booking_window_days);

    // ── Zone check via PostGIS ─────────────────────────────────────────────
    const [zoneCheck] = await sql`
      SELECT ST_DWithin(
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${cfg.zone_center_lng}, ${cfg.zone_center_lat}), 4326)::geography,
        ${radiusM}
      ) AS in_zone,
      h3_lat_lng_to_cell(point(${lng}, ${lat}), 7)::text AS h3_cell
    `;

    const inZone: boolean = zoneCheck.in_zone;
    const propertyH3Cell: string = zoneCheck.h3_cell;

    if (!inZone) {
      // Count waiting entries in this h3 cell so we can show queue position
      const [waitCount] = await sql`
        SELECT COUNT(*)::int AS count FROM photography_waitlist
        WHERE property_h3_cell = ${propertyH3Cell} AND status = 'waiting'
      `;
      return NextResponse.json({
        success: true,
        inServiceZone: false,
        propertyH3Cell,
        waitlistQueuePosition: (waitCount?.count ?? 0) + 1,
        zoneCenter: { lat: cfg.zone_center_lat, lng: cfg.zone_center_lng },
        zoneRadiusKm: cfg.zone_radius_km,
      });
    }

    // ── Count available shutterbugs (= capacity per slot) ─────────────────
    const [capRow] = await sql`
      SELECT COUNT(*)::int AS count FROM users
      WHERE role = 'shutterbug' AND push_token IS NOT NULL
    `;
    const capacity: number = capRow?.count ?? 0;

    // ── Build date range ───────────────────────────────────────────────────
    const windows: Array<{ id: string; label: string; startHour: number; startMin: number; endHour: number; endMin: number }> =
      cfg.time_windows as any;

    const now = new Date();
    const minLeadMs = cfg.min_lead_time_hours * 60 * 60 * 1000;

    // Generate dates for the next bookingDays days (skip today if too late)
    const dates: string[] = [];
    for (let i = 0; i < bookingDays + 1 && dates.length < bookingDays; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      // Skip Sundays (day 0) — configurable later
      // if (d.getDay() === 0) continue;
      const iso = d.toISOString().slice(0, 10);
      dates.push(iso);
    }

    if (dates.length === 0) {
      return NextResponse.json({ success: true, inServiceZone: true, availability: [], capacity });
    }

    // ── Fetch booking counts for all relevant date+window combos ──────────
    const bookedRows = await sql`
      SELECT slot_date, slot_window, COUNT(*)::int AS booked
      FROM photography_bookings
      WHERE slot_date = ANY(${dates}::text[])
        AND status != 'cancelled'
      GROUP BY slot_date, slot_window
    `;

    const bookedMap = new Map<string, number>();
    for (const row of bookedRows) {
      bookedMap.set(`${row.slot_date}|${row.slot_window}`, row.booked);
    }

    // ── Assemble availability per date ────────────────────────────────────
    const availability = dates.map((date) => {
      const windowsForDate = windows.map((w) => {
        // Compute absolute start time for this window on this date
        const slotStart = new Date(`${date}T${String(w.startHour).padStart(2, "0")}:${String(w.startMin).padStart(2, "0")}:00+05:30`);
        const tooSoon = slotStart.getTime() - now.getTime() < minLeadMs;

        const booked = bookedMap.get(`${date}|${w.id}`) ?? 0;
        const spotsLeft = Math.max(0, capacity - booked);
        const available = !tooSoon && spotsLeft > 0 && capacity > 0;

        return {
          id: w.id,
          label: w.label,
          startHour: w.startHour,
          startMin: w.startMin,
          endHour: w.endHour,
          endMin: w.endMin,
          available,
          spotsLeft: available ? spotsLeft : 0,
          tooSoon,
        };
      });

      const hasAnySlot = windowsForDate.some((w) => w.available);
      return { date, hasAnySlot, windows: windowsForDate };
    });

    return NextResponse.json({
      success: true,
      inServiceZone: true,
      propertyH3Cell,
      capacity,
      availability,
      zoneCenter: { lat: cfg.zone_center_lat, lng: cfg.zone_center_lng },
      zoneRadiusKm: cfg.zone_radius_km,
    });
  } catch (err: any) {
    console.error("[photography/availability] error:", err);
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}
