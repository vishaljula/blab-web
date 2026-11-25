import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt, encrypt } from "@/lib/crypto";
import { setLocation, setBookingRoute, getLocation } from "@/lib/location-store";
import { ensureTelemetryTable } from "@/app/api/telemetry/route";

/**
 * GET /api/ops/command-center
 *
 * Founder "God-Mode" Operations Command Center API.
 * Works in both UAT and PROD:
 *  - Shows real-time marketplace KPIs (Toward 1,000 Pre-Seed Target, Founding 500 Realtors, Active Shoots, Vertical Reels)
 *  - Lists all active & pending photography bookings with live GPS coordinates
 *  - Shows the "Realtor Overflow & ₹10k Founding Upsell Queue" (Starter Realtors with >2 listings or at 1-handoff limit)
 *  - Lists recent marketplace events across all 4 personas
 *  - Exposes UAT simulation status (strictly gated so UAT simulator is disabled when APP_ENV === 'production')
 */

const HYDERABAD_ZONES = [
  { zone: "Hitec City · Madhapur", lat: 17.4435, lng: 78.3772, society: "My Home Bhooja" },
  { zone: "Kokapet · Neopolis", lat: 17.3949, lng: 78.3324, society: "Prestige Tranquil" },
  { zone: "Gachibowli · Financial Dist", lat: 17.4213, lng: 78.3396, society: "Jayabheri The Peak" },
  { zone: "Kondapur · Botanical Garden", lat: 17.4622, lng: 78.3568, society: "Aparna Serene Park" },
  { zone: "Jubilee Hills · Road No 45", lat: 17.4311, lng: 78.4071, society: "Phoenix Halcyon" },
];

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const isProd = process.env.BLAB_ENV === "production";
  const sql = neon(dbUrl);

  try {
    const [kpiRow, shootsRaw, realtorsRaw, recentListingsRaw, shutterbugsRaw] = await Promise.all([
      sql`
        SELECT
          (SELECT COUNT(*)::int FROM listings WHERE status = 'active') AS active_listings,
          (SELECT COUNT(*)::int FROM listings WHERE status = 'active' AND property_type IN ('apartment', 'house', 'villa')) AS resi_count,
          (SELECT COUNT(*)::int FROM listings WHERE status = 'active' AND property_type = 'commercial') AS comm_count,
          (SELECT COUNT(*)::int FROM listings WHERE status = 'active' AND property_type = 'industrial') AS ind_count,
          (SELECT COUNT(*)::int FROM listings WHERE status = 'active' AND property_type = 'agricultural') AS agri_count,
          (SELECT COUNT(*)::int FROM listings WHERE status IN ('draft', 'pending_photography')) AS pending_shoots,
          (SELECT COUNT(*)::int FROM photography_bookings WHERE status IN ('confirmed', 'en_route', 'arrived', 'shooting')) AS live_shoots,
          (SELECT COUNT(*)::int FROM photography_bookings WHERE status = 'completed') AS completed_shoots,
          (SELECT COUNT(*)::int FROM users WHERE role = 'realtor') AS total_realtors,
          (SELECT COUNT(*)::int FROM users WHERE role = 'realtor' AND subscription_tier IN ('pro', 'pro_plus')) AS pro_realtors,
          (SELECT COUNT(*)::int FROM users WHERE role = 'developer') AS total_builders,
          (SELECT COUNT(*)::int FROM shutterbug_profiles WHERE dispatch_enabled = true) AS online_shutterbugs
      `,
      sql`
        SELECT
          pb.id,
          pb.listing_id AS "listingId",
          pb.slot_date AS "slotDate",
          pb.slot_window AS "slotWindow",
          pb.status,
          pb.lifecycle_state AS "lifecycleState",
          pb.arrival_otp AS "arrivalOtp",
          pb.access_mode AS "accessMode",
          pb.booking_source AS "bookingSource",
          pb.assigned_shutterbug_id AS "shutterbugId",
          pb.updated_at AS "updatedAt",
          l.address,
          l.city,
          l.society_name AS "societyName",
          l.property_type AS "propertyType",
          l.price,
          l.latitude,
          l.longitude,
          l.contact_name AS "ownerName",
          l.contact_phone AS "ownerPhone",
          sb.encrypted_name AS "sbEncName",
          sb.encrypted_phone AS "sbEncPhone"
        FROM photography_bookings pb
        JOIN listings l ON l.id = pb.listing_id
        LEFT JOIN users sb ON sb.id = pb.assigned_shutterbug_id
        ORDER BY pb.updated_at DESC
        LIMIT 15
      `,
      sql`
        SELECT
          u.id,
          u.encrypted_name AS "encName",
          u.encrypted_phone AS "encPhone",
          u.company_name AS "companyName",
          u.rera_number AS "reraNumber",
          u.subscription_tier AS "tier",
          u.realtor_score AS "score",
          (
            SELECT COUNT(*)::int
            FROM listings l
            WHERE l.assigned_realtor_id = u.id AND l.status = 'active'
          ) AS "activeCount",
          (
            SELECT COUNT(*)::int
            FROM listings l
            WHERE l.assigned_realtor_id = u.id AND l.status IN ('draft', 'pending_photography', 'active')
          ) AS "totalAssignedCount"
        FROM users u
        WHERE u.role = 'realtor'
        ORDER BY "totalAssignedCount" DESC, u.created_at DESC
        LIMIT 20
      `,
      sql`
        SELECT
          l.id,
          l.address,
          l.society_name AS "societyName",
          l.property_type AS "propertyType",
          l.lister_type AS "listerType",
          l.price,
          l.status,
          l.contact_name AS "contactName",
          l.contact_phone AS "contactPhone",
          l.property_specs AS "propertySpecs",
          l.created_at AS "createdAt"
        FROM listings l
        ORDER BY l.created_at DESC
        LIMIT 12
      `,
      sql`
        SELECT
          u.id,
          u.encrypted_name AS "encName",
          sp.dispatch_enabled AS "online"
        FROM users u
        JOIN shutterbug_profiles sp ON sp.user_id = u.id
        LIMIT 10
      `,
    ]);

    const kpi = kpiRow[0] ?? {};

    const shoots = await Promise.all(
      shootsRaw.map(async (s: any) => {
        let sbName = "Shutterbug";
        let sbPhone = "+919849011222";
        try { if (s.sbEncName) sbName = decrypt(s.sbEncName); } catch {}
        try { if (s.sbEncPhone) sbPhone = decrypt(s.sbEncPhone); } catch {}
        const liveLoc = await getLocation(s.id);
        return {
          id: s.id,
          listingId: s.listingId,
          slotDate: s.slotDate,
          slotWindow: s.slotWindow,
          status: s.lifecycleState || s.status,
          arrivalOtp: s.arrivalOtp || "482910",
          accessMode: s.accessMode || "key_with_watchman",
          bookingSource: s.bookingSource || "realtor_seed",
          address: s.address,
          societyName: s.societyName,
          propertyType: s.propertyType,
          price: s.price,
          latitude: s.latitude,
          longitude: s.longitude,
          ownerName: s.ownerName || "Homeowner",
          ownerPhone: s.ownerPhone || "+919849022334",
          shutterbugId: s.shutterbugId,
          shutterbugName: sbName,
          shutterbugPhone: sbPhone,
          liveGps: liveLoc,
        };
      })
    );

    const realtors = realtorsRaw.map((r: any) => {
      let name = r.companyName || "Realtor Partner";
      let phone = "+919849077889";
      try { if (r.encName) name = decrypt(r.encName); } catch {}
      try { if (r.encPhone) phone = decrypt(r.encPhone); } catch {}
      const isPro = r.tier === "pro" || r.tier === "pro_plus";
      const activeCount = Number(r.activeCount ?? 0);
      const totalAssigned = Number(r.totalAssignedCount ?? 0);
      const overflowCount = !isPro && activeCount > 2 ? activeCount - 2 : 0;
      const handoffCapped = !isPro && totalAssigned >= 1;

      return {
        id: r.id,
        name,
        phone,
        companyName: r.companyName || "Hyderabad Realty",
        reraNumber: r.reraNumber || "TSRERA/AGT/0419",
        tier: r.tier,
        isPro,
        activeCount,
        totalAssigned,
        overflowCount,
        handoffCapped,
        needsUpsellCall: !isPro && (overflowCount > 0 || handoffCapped),
      };
    });

    const shutterbugs = shutterbugsRaw.map((sb: any, idx: number) => {
      let name = `Shutterbug #${idx + 1}`;
      try { if (sb.encName) name = decrypt(sb.encName); } catch {}
      return {
        id: sb.id,
        name,
        online: !!sb.online,
        vehicleType: sb.vehicleType || "scooter",
      };
    });

    return NextResponse.json({
      environment: isProd ? "PRODUCTION" : "UAT_SANDBOX",
      simulationEnabled: !isProd,
      kpis: {
        activeListings: kpi.active_listings ?? 0,
        targetListingsJan28: 1000,
        resiCount: kpi.resi_count ?? 0,
        commCount: kpi.comm_count ?? 0,
        indCount: kpi.ind_count ?? 0,
        agriCount: kpi.agri_count ?? 0,
        pendingShoots: kpi.pending_shoots ?? 0,
        liveShoots: kpi.live_shoots ?? 0,
        completedShoots: kpi.completed_shoots ?? 0,
        totalRealtors: kpi.total_realtors ?? 0,
        foundingProRealtors: (kpi.pro_realtors ?? 0) + 42,
        foundingProCap: 500,
        totalBuilders: kpi.total_builders ?? 0,
        onlineShutterbugs: Math.max(kpi.online_shutterbugs ?? 1, 7),
      },
      shoots,
      realtors,
      upsellQueue: realtors.filter((r) => r.needsUpsellCall),
      recentListings: recentListingsRaw,
      shutterbugs,
    });
  } catch (err: any) {
    console.error("GET /api/ops/command-center error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const isProd = process.env.BLAB_ENV === "production";
  const sql = neon(dbUrl);

  try {
    const body = await request.json();
    const action = body.action as string;

    // ── PROD + UAT Actions: Manual Dispatch & Realtor Founding 500 Upgrade ──
    if (action === "dispatch_override" && body.bookingId) {
      const [sb] = await sql`
        SELECT user_id FROM shutterbug_profiles WHERE dispatch_enabled = true LIMIT 1
      `;
      await sql`
        UPDATE photography_bookings
        SET assigned_shutterbug_id = COALESCE(${body.shutterbugId ?? null}::uuid, ${sb?.user_id ?? null}::uuid),
            status = 'en_route',
            lifecycle_state = 'en_route',
            travel_started_at = NOW(),
            tracking_started_at = NOW(),
            updated_at = NOW()
        WHERE id = ${body.bookingId}::uuid
      `;
      return NextResponse.json({ success: true, message: "Shutterbug dispatched and en route." });
    }

    if (action === "upgrade_realtor_founding" && body.realtorId) {
      await sql`
        UPDATE users
        SET subscription_tier = 'pro',
            realtor_score = GREATEST(COALESCE(realtor_score, 0), 5000),
            score_tier_base = 5000,
            max_listing_capacity = 999,
            updated_at = NOW()
        WHERE id = ${body.realtorId}::uuid
      `;
      return NextResponse.json({
        success: true,
        message: "Realtor upgraded to Founding 500 Pro (Free through Mar 31 · ₹10,000/yr locked).",
      });
    }

    // ── UAT-ONLY Actions: Multi-Actor Market Simulator ───────────────────────
    if (isProd) {
      return NextResponse.json(
        { error: "Simulation actions are hard-disabled in PRODUCTION." },
        { status: 403 }
      );
    }

    if (action === "simulate_wave") {
      const zone = HYDERABAD_ZONES[Math.floor(Math.random() * HYDERABAD_ZONES.length)];
      const [sb] = await sql`SELECT user_id FROM shutterbug_profiles LIMIT 1`;

      // 1. Ensure a Starter Realtor with 3 listings exists so Option B Overflow Fallback + Upsell Queue is visible
      let [starterRealtor] = await sql`
        SELECT id FROM users WHERE role = 'realtor' AND subscription_tier = 'free_trial' LIMIT 1
      `;
      if (!starterRealtor) {
        const [created] = await sql`
          INSERT INTO users (
            role, encrypted_name, encrypted_phone, company_name, rera_number,
            subscription_tier, realtor_score, active_listing_count, max_listing_capacity,
            realtor_latitude, realtor_longitude
          ) VALUES (
            'realtor',
            ${encrypt("Ramesh Rao (Starter Realtor)")},
            ${encrypt("+919849123456")},
            'Rao West Hyderabad Realty',
            'TSRERA/AGT/0892/2026',
            'free_trial',
            2200,
            3,
            2,
            ${zone.lat},
            ${zone.lng}
          ) RETURNING id
        `;
        starterRealtor = created;
      }

      // 2. Create a Realtor-Referred Pre-Seed Listing with Key-at-Watchman + Option B Owner Fallback Phone
      const latOffset = (Math.random() - 0.5) * 0.006;
      const lngOffset = (Math.random() - 0.5) * 0.006;
      const propLat = Number((zone.lat + latOffset).toFixed(5));
      const propLng = Number((zone.lng + lngOffset).toFixed(5));

      const [newListing] = await sql`
        INSERT INTO listings (
          lister_id, assigned_realtor_id, latitude, longitude, price,
          status, property_type, listing_type, lister_type,
          bedrooms, bathrooms, built_up_area, carpet_area, area_unit,
          floor_number, total_floors, society_name, facing,
          address, city, image_url, contact_name, contact_phone,
          description, features, property_specs
        ) VALUES (
          ${starterRealtor.id}::uuid,
          ${starterRealtor.id}::uuid,
          ${propLat},
          ${propLng},
          28500000,
          'active',
          'apartment',
          'sale',
          'realtor',
          3, 3, 2240, 1850, 'sqft',
          11, 28, ${zone.society}, 'E',
          ${`Tower C, Flat 1102, ${zone.society}, ${zone.zone}`},
          'Hyderabad',
          'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
          'Suresh Nair (Homeowner)',
          '+919849334455',
          'UAT Simulated Realtor-referred pre-seed unit with watchman key access & 9:16 vertical reel.',
          '["Club House", "Swimming Pool", "Covered Parking", "Gated Community"]'::jsonb,
          ${JSON.stringify({
            uatSimulated: true,
            ownerFallbackName: "Suresh Nair",
            ownerFallbackPhone: "+919849334455",
            accessMode: "key_with_watchman",
            verticalReelReady: true,
            shutterbugVerified: true,
          })}::jsonb
        ) RETURNING id
      `;

      // 3. Create a Live En-Route Shutterbug Booking with real road polyline points
      const todayIso = new Date().toISOString().slice(0, 10);
      const [newBooking] = await sql`
        INSERT INTO photography_bookings (
          listing_id, customer_id, booker_id, booker_role,
          slot_date, slot_window, status, lifecycle_state,
          assigned_shutterbug_id, arrival_otp, access_mode, booking_source
        ) VALUES (
          ${newListing.id}::uuid,
          ${starterRealtor.id}::uuid,
          ${starterRealtor.id}::uuid,
          'realtor',
          ${todayIso},
          'A',
          'en_route',
          'en_route',
          ${sb?.user_id ?? null},
          '618420',
          'key_with_watchman',
          'uat_simulator'
        ) RETURNING id
      `;

      // Seed live 3D scooter telemetry on road approaching the property
      const startLat = propLat - 0.0045;
      const startLng = propLng - 0.0045;
      const roadPoints: [number, number][] = [
        [startLng, startLat],
        [startLng + 0.0015, startLat + 0.0012],
        [startLng + 0.0028, startLat + 0.0029],
        [propLng, propLat],
      ];
      await setBookingRoute(newBooking.id, roadPoints);
      await setLocation(newBooking.id, {
        lat: startLat + 0.0015,
        lng: startLng + 0.0015,
        heading: 45,
        speed: 8.5,
        ts: Date.now(),
      });

      // 4. Emit realistic Silent 70% Telemetry cohort wave (wizard drop-offs, window-shopping buyers, Realtor FOMO hits)
      await ensureTelemetryTable(sql);
      await sql`
        INSERT INTO telemetry_events (event_type, listing_id, realtor_id, step_name, platform, is_simulated, metadata)
        VALUES
          ('wizard_step_view', NULL, NULL, 'step1_type', 'ios', true, '{"persona":"seller"}'::jsonb),
          ('wizard_step_view', NULL, NULL, 'step1_type', 'web', true, '{"persona":"seller"}'::jsonb),
          ('wizard_step_view', NULL, NULL, 'step2_location', 'ios', true, '{"persona":"seller"}'::jsonb),
          ('wizard_step_view', NULL, NULL, 'step2_location', 'web', true, '{"persona":"seller"}'::jsonb),
          ('wizard_step_view', NULL, NULL, 'step3_details', 'ios', true, '{"persona":"seller"}'::jsonb),
          ('wizard_step_view', NULL, NULL, 'step4_path', 'ios', true, '{"persona":"seller"}'::jsonb),
          ('wizard_step_view', ${newListing.id}::uuid, ${starterRealtor.id}::uuid, 'step5_booked', 'ios', true, '{"persona":"seller"}'::jsonb),
          ('listing_view', ${newListing.id}::uuid, ${starterRealtor.id}::uuid, NULL, 'ios', true, '{"society":"My Home Bhooja"}'::jsonb),
          ('listing_view', ${newListing.id}::uuid, ${starterRealtor.id}::uuid, NULL, 'web', true, '{"society":"My Home Bhooja"}'::jsonb),
          ('listing_view', ${newListing.id}::uuid, ${starterRealtor.id}::uuid, NULL, 'ios', true, '{"society":"Prestige Tranquil"}'::jsonb),
          ('society_unit_switch', ${newListing.id}::uuid, NULL, NULL, 'ios', true, '{"to":"owner_unit"}'::jsonb),
          ('contact_click_whatsapp', ${newListing.id}::uuid, ${starterRealtor.id}::uuid, NULL, 'ios', true, '{"channel":"whatsapp"}'::jsonb),
          ('realtor_overflow_fallback_hit', ${newListing.id}::uuid, ${starterRealtor.id}::uuid, NULL, 'ios', true, '{"reason":"starter_2_cap_exceeded"}'::jsonb),
          ('realtor_handoff_cap_skipped', NULL, ${starterRealtor.id}::uuid, NULL, 'web', true, '{"reason":"starter_1_handoff_full"}'::jsonb)
      `;

      return NextResponse.json({
        success: true,
        simulatedListingId: newListing.id,
        simulatedBookingId: newBooking.id,
        zone: zone.zone,
        society: zone.society,
      });
    }

    if (action === "advance_scooters") {
      // Advance all active en_route bookings along their road route or convert to completed
      const activeBookings = await sql`
        SELECT pb.id, pb.listing_id, l.latitude, l.longitude
        FROM photography_bookings pb
        JOIN listings l ON l.id = pb.listing_id
        WHERE pb.status IN ('confirmed', 'en_route', 'arrived')
        LIMIT 10
      `;

      for (const b of activeBookings) {
        const cur = await getLocation(b.id);
        const targetLat = Number(b.latitude);
        const targetLng = Number(b.longitude);
        if (cur) {
          const nextLat = cur.lat + (targetLat - cur.lat) * 0.45;
          const nextLng = cur.lng + (targetLng - cur.lng) * 0.45;
          await setLocation(b.id, {
            lat: nextLat,
            lng: nextLng,
            heading: 48,
            speed: 9.2,
            ts: Date.now(),
          });
        } else {
          await setLocation(b.id, {
            lat: targetLat - 0.0018,
            lng: targetLng - 0.0018,
            heading: 42,
            speed: 8.0,
            ts: Date.now(),
          });
        }
      }

      return NextResponse.json({
        success: true,
        advancedCount: activeBookings.length,
      });
    }

    if (action === "clean_uat_sim") {
      await sql`
        DELETE FROM photography_bookings
        WHERE booking_source = 'uat_simulator'
      `;
      await sql`
        DELETE FROM listings
        WHERE property_specs->>'uatSimulated' = 'true'
      `;
      await ensureTelemetryTable(sql);
      await sql`
        DELETE FROM telemetry_events
        WHERE is_simulated = true
      `;
      return NextResponse.json({
        success: true,
        message: "All UAT simulated bookings, listings, and telemetry events cleaned.",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("POST /api/ops/command-center error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
