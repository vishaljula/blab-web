import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";
import { redis, REALTOR_RESERVATION_TTL } from "@/lib/redis";

const SEARCH_RADIUS_M = parseInt(process.env.REALTOR_SEARCH_RADIUS_M ?? "6000", 10);

/**
 * GET /api/realtors/available
 *
 * Query params:
 *   lat, lng   — coordinates for geo-ranked results (optional)
 *   limit      — max results (default 3, max 10)
 *   exclude    — comma-separated IDs to exclude (e.g. previously assigned realtor)
 *   q          — search by company_name or rera_number (bypasses soft reservation)
 *
 * Ranking: realtor_score DESC (composite — tier, responsiveness, activity, reviews).
 * Capacity gate: active_listing_count < max_listing_capacity enforced in WHERE.
 *
 * Soft reservation (Redis):
 *   On each successful fetch, the returned realtors are marked as "in-view"
 *   in Redis with a TTL of REALTOR_RESERVATION_TTL seconds. Subsequent fetches
 *   exclude these IDs so concurrent customers see different realtors.
 *   Falls back gracefully if Redis is unavailable.
 */
export async function GET(request: NextRequest) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json([], { status: 200 });

  const { searchParams } = request.nextUrl;
  const lat     = parseFloat(searchParams.get("lat") ?? "");
  const lng     = parseFloat(searchParams.get("lng") ?? "");
  const limit   = Math.min(parseInt(searchParams.get("limit") ?? "3", 10), 10);
  const q       = searchParams.get("q")?.trim() ?? "";
  const exclude = searchParams.get("exclude")?.split(",").filter(Boolean) ?? [];

  const hasCoords = !isNaN(lat) && !isNaN(lng);
  const isSearch  = q.length > 0;

  try {
    const sql = neon(dbUrl);

    // ── Redis: fetch currently reserved IDs ───────────────────────────────────
    // Skipped during search (search results are not reserved — they're explicit).
    let reservedIds: string[] = [];
    if (!isSearch && redis) {
      try {
        const keys = await redis.keys("realtor:reserved:*");
        reservedIds = keys.map((k: string) => k.replace("realtor:reserved:", ""));
      } catch (redisErr) {
        console.warn("[realtors/available] Redis reservation check failed, skipping:", redisErr);
      }
    }

    // Merge client-side excludes with Redis-reserved IDs
    const allExcludedIds = [...new Set([...exclude, ...reservedIds])];

    let rows: any[];

    if (isSearch) {
      // ── Search by company_name or rera_number ─────────────────────────────
      // Names are AES-encrypted — ILIKE on name is not possible.
      //
      // RERA normalization: strip the "RERA" prefix, slashes, spaces and any
      // punctuation so that "00041", "TSRERA/AGT/00041", "RERA TSRERA/AGT/00041"
      // all resolve to the same token and match the stored number.
      //
      // Both sides are normalized using regexp_replace('[^A-Za-z0-9]','','g')
      // so the format the user types never matters.
      const normalizedQ = q
        .trim()
        .replace(/^rera\s*/i, "")      // strip leading "RERA" word
        .replace(/[^a-zA-Z0-9]/g, ""); // strip everything else

      const companyPattern = `%${q}%`; // company name search: keep original spacing
      const reraPattern    = `%${normalizedQ}%`;

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
          u.score_response_rate     AS "scoreResponseRate",
          u.total_deals             AS "totalDeals",
          u.active_listing_count    AS "activeListingCount",
          u.max_listing_capacity    AS "maxListingCapacity",
          NULL                      AS "distanceM"
        FROM users u
        WHERE u.role = 'realtor'
          AND u.subscription_tier != 'soft_cap'
          AND u.active_listing_count < u.max_listing_capacity
          AND (
            u.company_name ILIKE ${companyPattern}
            OR regexp_replace(u.rera_number, '[^A-Za-z0-9]', '', 'g')
               ILIKE ${reraPattern}
          )
        ORDER BY u.realtor_score DESC
        LIMIT ${limit}
      `;

    } else if (hasCoords) {
      // ── Geo-ranked query with soft-reservation exclusion ──────────────────────
      if (allExcludedIds.length > 0) {
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
            u.score_response_rate     AS "scoreResponseRate",
            u.total_deals             AS "totalDeals",
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
            AND u.id != ALL(${allExcludedIds}::uuid[])
          ORDER BY
            u.realtor_score DESC,
            "distanceM" ASC
          LIMIT ${limit}
        `;
      } else {
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
            u.score_response_rate     AS "scoreResponseRate",
            u.total_deals             AS "totalDeals",
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
      }
    } else {
      // ── No coordinates — national fallback with exclusion ─────────────────────
      if (allExcludedIds.length > 0) {
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
            u.score_response_rate     AS "scoreResponseRate",
            u.total_deals             AS "totalDeals",
            u.active_listing_count    AS "activeListingCount",
            u.max_listing_capacity    AS "maxListingCapacity",
            NULL                      AS "distanceM"
          FROM users u
          WHERE u.role = 'realtor'
            AND u.subscription_tier != 'soft_cap'
            AND u.active_listing_count < u.max_listing_capacity
            AND u.id != ALL(${allExcludedIds}::uuid[])
          ORDER BY u.realtor_score DESC
          LIMIT ${limit}
        `;
      } else {
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
            u.score_response_rate     AS "scoreResponseRate",
            u.total_deals             AS "totalDeals",
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
    }

    // Decrypt names server-side before returning
    const realtors = rows.map((r) => {
      let name = "Realtor";
      try {
        if (r.encryptedName) name = decrypt(r.encryptedName);
      } catch {}
      return { ...r, name, encryptedName: undefined };
    });

    // ── Redis: soft-reserve the returned realtors ─────────────────────────────
    // Mark each returned realtor as "in-view" for REALTOR_RESERVATION_TTL seconds.
    // The next customer's fetch will exclude these IDs, ensuring they see fresh realtors.
    // Search results are not reserved (explicit lookup — customer knows who they want).
    if (!isSearch && redis && realtors.length > 0) {
      try {
        await Promise.all(
          realtors.map((r) =>
            redis!.set(`realtor:reserved:${r.id}`, "1", { ex: REALTOR_RESERVATION_TTL })
          )
        );
      } catch (redisErr) {
        console.warn("[realtors/available] Redis reservation set failed, skipping:", redisErr);
      }
    }

    return NextResponse.json(realtors);
  } catch (err) {
    console.error("GET /api/realtors/available failed:", err);
    return NextResponse.json([], { status: 200 });
  }
}
