import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

/**
 * GET /api/realtors/dashboard
 *
 * Property-centric dashboard for authenticated realtors.
 * Returns: realtor profile, stat counts, and myListings[] with nested
 * enquiries + viewings per listing — all in one round-trip.
 *
 * Auth: Bearer token (mobile).
 */

// Stock photos used when listing has no image_url (all seeded listings currently)
const STOCK = [
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=400&q=70",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=400&q=70",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=400&q=70",
  "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=400&q=70",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=70",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=400&q=70",
];

function stockPhoto(address: string, price: number): string {
  return STOCK[Math.abs((price ?? 0) + (address?.charCodeAt(0) ?? 0)) % STOCK.length];
}

/** Convert Postgres timestamp to strict ISO 8601 for Hermes JS engine.
 *  Neon driver returns proper ISO for top-level columns, but JSON_BUILD_OBJECT
 *  inside JSON_AGG returns Postgres space-format: "2026-07-23 09:45:08+00".
 *  This normalises both cases without double-appending ":00". */
function toISO(ts: unknown): string | null {
  if (!ts) return null;
  const s = String(ts);
  // Already valid ISO — ends with Z or has ±HH:MM offset
  if (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s)) return s;
  // Postgres space format → ISO T separator, bare "+00" → "+00:00"
  return s.replace(" ", "T").replace(/\+00$/, "+00:00");
}

export async function GET(request: NextRequest) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const realtorId = await resolveRealtorId(request);
  if (!realtorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sql = neon(dbUrl);

    // ── Fetch all data concurrently ───────────────────────────────────────────
    const [realtorRow, statsRow, listingsRaw] = await Promise.all([

      // 1. Realtor profile
      sql`
        SELECT
          id, encrypted_name, company_name, photo_url,
          subscription_tier, realtor_score, score_tier_base,
          trial_sale_leads_used, trial_rental_leads_used,
          active_listing_count, max_listing_capacity
        FROM users
        WHERE id = ${realtorId} AND role = 'realtor'
        LIMIT 1
      `,

      // 2. Top-level stat counts
      sql`
        SELECT
          (SELECT COUNT(*)::int FROM leads
            WHERE realtor_id = ${realtorId} AND responded_at IS NULL AND closed_at IS NULL
          ) AS open_enquiries,
          (SELECT COUNT(*)::int FROM leads
            WHERE realtor_id = ${realtorId} AND created_at > NOW() - INTERVAL '7 days'
          ) AS new_enquiries_7d,
          (SELECT COUNT(*)::int FROM viewings
            WHERE realtor_id = ${realtorId}
              AND scheduled_at > NOW()
              AND status IN ('pending', 'confirmed')
          ) AS upcoming_viewings
      `,

      // 3. My listings — each with nested enquiries + viewings via LATERAL JOINs
      sql`
        SELECT
          l.id,
          l.address,
          l.city,
          l.price,
          l.property_type  AS "propertyType",
          l.listing_type   AS "listingType",
          l.bedrooms,
          l.image_url      AS "imageUrl",
          l.status,
          l.contact_name   AS "contactName",
          l.contact_phone  AS "contactPhone",

          -- Enquiry aggregates
          COALESCE(eq.enquiry_count, 0)      AS "enquiryCount",
          COALESCE(eq.open_enquiry_count, 0) AS "openEnquiryCount",
          eq.recent_enquiries                AS "recentEnquiries",

          -- Viewing aggregates
          COALESCE(vw.upcoming_count, 0)     AS "upcomingViewingCount",
          COALESCE(vw.total_count, 0)        AS "totalViewingCount",
          vw.next_viewing_at                 AS "nextViewingAt",
          vw.all_viewings                    AS "viewings"

        FROM listings l

        -- Enquiries lateral
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int                                             AS enquiry_count,
            COUNT(*) FILTER (WHERE responded_at IS NULL)::int        AS open_enquiry_count,
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id',              le.id,
                'requesterName',   le.requester_name,
                'requesterPhone',  le.requester_phone,
                'createdAt',       le.created_at,
                'respondedAt',     le.responded_at,
                'responseChannel', le.response_channel
              ) ORDER BY le.created_at DESC
            ) FILTER (WHERE le.id IS NOT NULL)                       AS recent_enquiries
          FROM leads le
          WHERE le.listing_id = l.id AND le.realtor_id = ${realtorId}
        ) eq ON true

        -- Viewings lateral (LEFT JOIN users to get buyer encrypted name)
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE v.scheduled_at > NOW() AND v.status IN ('pending','confirmed'))::int AS upcoming_count,
            COUNT(*)::int                                                                                AS total_count,
            MIN(v.scheduled_at) FILTER (WHERE v.scheduled_at > NOW() AND v.status IN ('pending','confirmed')) AS next_viewing_at,
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id',                   v.id,
                'scheduledAt',          v.scheduled_at,
                'status',               v.status,
                'durationMins',         v.duration_mins,
                'buyerEncryptedName',   bu.encrypted_name
              ) ORDER BY v.scheduled_at ASC
            ) FILTER (WHERE v.id IS NOT NULL)                        AS all_viewings
          FROM viewings v
          LEFT JOIN users bu ON bu.id = v.buyer_id
          WHERE v.listing_id = l.id AND v.realtor_id = ${realtorId}
            AND v.status != 'cancelled'
        ) vw ON true

        WHERE l.assigned_realtor_id = ${realtorId}
        ORDER BY l.created_at DESC
      `,
    ]);

    if (!realtorRow.length) {
      return NextResponse.json({ error: "Realtor not found" }, { status: 404 });
    }

    const r   = realtorRow[0];
    const st  = statsRow[0];
    let name  = "Realtor";
    try { if (r.encrypted_name) name = decrypt(r.encrypted_name); } catch {}

    // ── Normalize listings ────────────────────────────────────────────────────
    const myListings = listingsRaw.map((l: any) => ({
      id:                  l.id,
      address:             l.address,
      city:                l.city,
      price:               l.price,
      propertyType:        l.propertyType,
      listingType:         l.listingType,
      bedrooms:            l.bedrooms,
      imageUrl:            l.imageUrl || stockPhoto(l.address, l.price),
      status:              l.status,
      contactName:         l.contactName,
      contactPhone:        l.contactPhone,
      enquiryCount:        l.enquiryCount,
      openEnquiryCount:    l.openEnquiryCount,
      upcomingViewingCount: l.upcomingViewingCount,
      totalViewingCount:   l.totalViewingCount,
      nextViewingAt:       toISO(l.nextViewingAt),
      // Normalize nested arrays — JSON_AGG returns null when no rows
      recentEnquiries: (l.recentEnquiries ?? []).map((e: any) => ({
        ...e,
        createdAt:   toISO(e.createdAt),
        respondedAt: toISO(e.respondedAt),
      })),
      viewings: (l.viewings ?? []).map((v: any) => {
        // Decrypt buyer name (encrypted_name stored in DB, decrypted server-side)
        let buyerName: string | null = null;
        try { if (v.buyerEncryptedName) buyerName = decrypt(v.buyerEncryptedName); } catch {}
        return {
          ...v,
          scheduledAt: toISO(v.scheduledAt),
          buyerName,
          buyerEncryptedName: undefined, // strip the raw encrypted field from response
        };
      }),
    }));

    return NextResponse.json({
      realtor: {
        id:                   r.id,
        name,
        companyName:          r.company_name,
        photoUrl:             r.photo_url,
        subscriptionTier:     r.subscription_tier,
        realtorScore:         r.realtor_score,
        scoreTierBase:        r.score_tier_base,
        trialSaleLeadsUsed:   r.trial_sale_leads_used   ?? 0,
        trialRentalLeadsUsed: r.trial_rental_leads_used ?? 0,
        trialSaleLeadsMax:    3,
        trialRentalLeadsMax:  3,
        activeListingCount:   r.active_listing_count  ?? 0,
        maxListingCapacity:   r.max_listing_capacity  ?? 2,
      },
      stats: {
        openEnquiries:      st.open_enquiries      ?? 0,
        newEnquiries7d:     st.new_enquiries_7d    ?? 0,
        upcomingViewings:   st.upcoming_viewings   ?? 0,
        activeListings:     r.active_listing_count ?? 0,
      },
      myListings,
    });

  } catch (err) {
    console.error("GET /api/realtors/dashboard failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function resolveRealtorId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const { decrypt } = await import("@/lib/crypto");
      const token   = authHeader.replace("Bearer ", "").trim();
      const payload = JSON.parse(decrypt(token));
      if (payload.userId && payload.expiry > Date.now()) return payload.userId;
    } catch {}
  }
  return null;
}
