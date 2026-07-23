import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

const SEARCH_RADIUS_M = parseInt(process.env.REALTOR_SEARCH_RADIUS_M ?? "6000", 10);

/**
 * GET /api/realtors/available?lat=17.385&lng=78.486&limit=5
 *
 * Returns ranked realtors within SEARCH_RADIUS_M of the given coordinate.
 * Ranking: realtor_score DESC (composite score — tier, responsiveness, activity, reviews).
 * Capacity gate: active_listing_count < max_listing_capacity enforced in WHERE clause.
 * Routing cascade: Pro+ → Pro → Trial → soft_cap overflow (separate endpoint).
 */
export async function GET(request: NextRequest) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json([], { status: 200 });

  const { searchParams } = request.nextUrl;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "5", 10), 20);

  // If no coordinates provided, fall back to a simple list (listing wizard without GPS)
  const hasCoords = !isNaN(lat) && !isNaN(lng);

  try {
    const sql = neon(dbUrl);

    let rows: any[];

    if (hasCoords) {
      // Full geo-ranked query with capacity gate
      rows = await sql`
        SELECT
          u.id,
          u.encrypted_name          AS "encryptedName",
          u.company_name            AS "companyName",
          u.rera_number             AS "reraNumber",
          u.photo_url               AS "photoUrl",
          u.bio,
          u.years_experience        AS "yearsExperience",
          u.areas_served            AS "areasServed",
          u.languages_spoken        AS "languagesSpoken",
          u.subscription_tier       AS "subscriptionTier",
          u.realtor_score           AS "realtorScore",
          u.score_response_rate     AS "scoreResponseRate",
          u.active_listing_count    AS "activeListingCount",
          u.max_listing_capacity    AS "maxListingCapacity",
          ROUND(
            ST_Distance(u.base_location, ST_MakePoint(${lng}, ${lat})::geography)
          )::int                    AS "distanceM"
        FROM users u
        WHERE u.role = 'realtor'
          AND u.subscription_tier != 'soft_cap'
          AND u.base_location IS NOT NULL
          AND ST_DWithin(
            u.base_location,
            ST_MakePoint(${lng}, ${lat})::geography,
            ${SEARCH_RADIUS_M}
          )
          AND u.active_listing_count < u.max_listing_capacity
        ORDER BY
          u.realtor_score DESC,
          "distanceM" ASC
        LIMIT ${limit}
      `;
    } else {
      // No coordinates — return top realtors nationally (fallback for web listing wizard)
      rows = await sql`
        SELECT
          u.id,
          u.encrypted_name          AS "encryptedName",
          u.company_name            AS "companyName",
          u.rera_number             AS "reraNumber",
          u.photo_url               AS "photoUrl",
          u.bio,
          u.years_experience        AS "yearsExperience",
          u.areas_served            AS "areasServed",
          u.languages_spoken        AS "languagesSpoken",
          u.subscription_tier       AS "subscriptionTier",
          u.realtor_score           AS "realtorScore",
          u.score_response_rate     AS "scoreResponseRate",
          u.active_listing_count    AS "activeListingCount",
          u.max_listing_capacity    AS "maxListingCapacity",
          NULL                      AS "distanceM"
        FROM users u
        WHERE u.role = 'realtor'
          AND u.subscription_tier != 'soft_cap'
          AND u.active_listing_count < u.max_listing_capacity
        ORDER BY u.realtor_score DESC
        LIMIT ${limit}
      `;
    }

    // Decrypt names server-side before returning
    const realtors = rows.map((r) => {
      let name = "Realtor";
      try {
        if (r.encryptedName) name = decrypt(r.encryptedName);
      } catch {}
      return { ...r, name, encryptedName: undefined };
    });

    return NextResponse.json(realtors);
  } catch (err) {
    console.error("GET /api/realtors/available failed:", err);
    return NextResponse.json([], { status: 200 });
  }
}
