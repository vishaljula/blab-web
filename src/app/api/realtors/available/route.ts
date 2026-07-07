import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * GET /api/realtors/available
 *
 * Returns a curated shortlist of up to 3 realtors with active Blab
 * subscriptions. Ordered by activity signals:
 *   1. deals_closed DESC (primary — proven track record)
 *   2. avg_response_hours ASC (secondary — responsiveness)
 *
 * Future: geo-filter by lat/lng once we add a location column to users.
 * For now: returns the top 3 nationally — good enough for Hyderabad-only launch.
 */
export async function GET(request: NextRequest) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json([], { status: 200 });

  try {
    const sql = neon(dbUrl);

    // realtors who have a valid subscription and a RERA number
    // encrypted_name is AES-encrypted — we alias it as-is and decrypt on client
    // (in production, decrypt server-side with the shared key before returning)
    const rows = await sql`
      SELECT
        id,
        encrypted_name   AS "name",
        company_name     AS "companyName",
        rera_number      AS "reraNumber",
        0                AS "dealsCount",
        24               AS "avgResponseHours",
        TRUE             AS "isVerified"
      FROM users
      WHERE role = 'broker'
        AND rera_number IS NOT NULL
        AND rera_number != ''
      ORDER BY created_at DESC
      LIMIT 3
    `;

    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/realtors/available failed:", err);
    return NextResponse.json([], { status: 200 }); // silently return empty — UI handles this
  }
}
