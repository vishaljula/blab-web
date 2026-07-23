import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

/**
 * GET /api/realtors/leads?status=open&page=1
 * Returns the authenticated realtor's leads list.
 *
 * POST /api/realtors/leads
 * Creates a lead when a buyer taps "Contact Realtor".
 * Lead is created immediately on tap — no confirmation step (industry standard).
 * Increments the correct trial/soft-cap counter in the same transaction.
 */

// ── GET — Realtor's leads list ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const realtorId = await resolveUserId(request);
  if (!realtorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") ?? "all"; // all | open | responded | closed
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  try {
    const sql = neon(dbUrl);

    const whereStatus =
      status === "open"       ? sql`AND l.closed_at IS NULL AND l.responded_at IS NULL` :
      status === "responded"  ? sql`AND l.closed_at IS NULL AND l.responded_at IS NOT NULL` :
      status === "closed"     ? sql`AND l.closed_at IS NOT NULL` :
      sql``;  // all

    const rows = await sql`
      SELECT
        l.id,
        l.type,
        l.created_at        AS "createdAt",
        l.responded_at      AS "respondedAt",
        l.response_channel  AS "responseChannel",
        l.closed_at         AS "closedAt",
        l.outcome,
        l.notes,
        l.requester_name    AS "requesterName",
        l.requester_phone   AS "requesterPhone",
        li.id               AS "listingId",
        li.address,
        li.city,
        li.listing_type     AS "listingType",
        li.property_type    AS "propertyType",
        li.price,
        li.bedrooms,
        li.image_url        AS "imageUrl",
        li.status           AS "listingStatus"
      FROM leads l
      LEFT JOIN listings li ON l.listing_id = li.id
      WHERE l.realtor_id = ${realtorId}
        ${whereStatus}
      ORDER BY l.created_at DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `;

    return NextResponse.json({ leads: rows, page, pageSize });
  } catch (err) {
    console.error("GET /api/realtors/leads failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── POST — Create a lead (buyer taps "Contact Realtor") ──────────────────────

export async function POST(request: NextRequest) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const requesterId = await resolveUserId(request);
  if (!requesterId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.realtorId || !body?.listingId) {
    return NextResponse.json({ error: "realtorId and listingId are required" }, { status: 400 });
  }

  const { realtorId, listingId, type = "buyer_enquiry" } = body;

  try {
    const sql = neon(dbUrl);

    // Fetch requester info + listing type + realtor tier — all in one query
    const [requesterRow, listingRow, realtorRow] = await Promise.all([
      sql`SELECT encrypted_name, encrypted_phone FROM users WHERE id = ${requesterId} LIMIT 1`,
      sql`SELECT listing_type FROM listings WHERE id = ${listingId} LIMIT 1`,
      sql`
        SELECT
          subscription_tier,
          trial_sale_leads_used, trial_rental_leads_used,
          soft_cap_sale_leads_month, soft_cap_rental_leads_month,
          soft_cap_month,
          max_listing_capacity, active_listing_count
        FROM users
        WHERE id = ${realtorId} AND role = 'realtor'
        LIMIT 1
      `,
    ]);

    if (!realtorRow.length) return NextResponse.json({ error: "Realtor not found" }, { status: 404 });

    let requesterName = "Buyer";
    let requesterPhone = "";
    try { if (requesterRow[0]?.encrypted_name) requesterName = decrypt(requesterRow[0].encrypted_name); } catch {}
    try { if (requesterRow[0]?.encrypted_phone) requesterPhone = decrypt(requesterRow[0].encrypted_phone); } catch {}

    const listingType = listingRow[0]?.listing_type ?? "sale";
    const realtor = realtorRow[0];
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // ── Cap checks (soft_cap tier only) ────────────────────────────────────
    // Buyers can ALWAYS contact a realtor — the trial cap only applies when
    // a SELLER assigns a realtor to their listing (handled in POST /api/listings).
    // Here we only check soft_cap monthly limits.
    const tier = realtor.subscription_tier;
    let overflowFlag = false;

    if (tier === "soft_cap") {
      const sameMonth = realtor.soft_cap_month === currentMonth;
      const saleUsed = sameMonth ? (realtor.soft_cap_sale_leads_month ?? 0) : 0;
      const rentUsed = sameMonth ? (realtor.soft_cap_rental_leads_month ?? 0) : 0;

      const used = listingType === "sale" ? saleUsed : rentUsed;
      if (used >= 1) {
        // Overflow — still route but flag it
        overflowFlag = true;
      }
    }

    // ── Insert lead ────────────────────────────────────────────────────────
    const [newLead] = await sql`
      INSERT INTO leads
        (realtor_id, listing_id, requester_id, requester_name, requester_phone, type)
      VALUES
        (${realtorId}, ${listingId}, ${requesterId}, ${requesterName}, ${requesterPhone}, ${type})
      RETURNING id, created_at
    `;

    // ── Update counters ────────────────────────────────────────────────────
    if (tier === "soft_cap") {
      if (overflowFlag) {
        await sql`UPDATE users SET soft_cap_overflow_leads = soft_cap_overflow_leads + 1, last_lead_assigned_at = NOW() WHERE id = ${realtorId}`;
      } else {
        if (listingType === "sale") {
          await sql`
            UPDATE users SET
              soft_cap_sale_leads_month = CASE WHEN soft_cap_month = ${currentMonth} THEN soft_cap_sale_leads_month + 1 ELSE 1 END,
              soft_cap_month = ${currentMonth},
              last_lead_assigned_at = NOW()
            WHERE id = ${realtorId}
          `;
        } else {
          await sql`
            UPDATE users SET
              soft_cap_rental_leads_month = CASE WHEN soft_cap_month = ${currentMonth} THEN soft_cap_rental_leads_month + 1 ELSE 1 END,
              soft_cap_month = ${currentMonth},
              last_lead_assigned_at = NOW()
            WHERE id = ${realtorId}
          `;
        }
      }
    } else {
      // Pro / Pro+ / free_trial — just update the timestamp
      await sql`UPDATE users SET last_lead_assigned_at = NOW() WHERE id = ${realtorId}`;
    }

    return NextResponse.json({
      leadId: newLead.id,
      createdAt: newLead.created_at,
      overflow: overflowFlag,
    }, { status: 201 });

  } catch (err) {
    console.error("POST /api/realtors/leads failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.replace("Bearer ", "").trim();
      const payload = JSON.parse(decrypt(token));
      if (payload.userId && payload.expiry > Date.now()) return payload.userId;
    } catch {}
  }
  return null;
}
