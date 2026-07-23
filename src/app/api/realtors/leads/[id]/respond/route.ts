import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

/**
 * POST /api/realtors/leads/[id]/respond
 *
 * Marks a lead as responded. Updates:
 *   responded_at = NOW()
 *   response_channel = body.responseChannel
 *
 * Also recalculates score_response_rate and score_response_speed for the realtor.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const realtorId = await resolveRealtorId(request);
  if (!realtorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;
  const body = await request.json().catch(() => ({}));
  const channel = body.responseChannel ?? "in_app";

  try {
    const sql = neon(dbUrl);

    // Verify the lead belongs to this realtor and is not yet responded
    const [lead] = await sql`
      SELECT id, realtor_id, created_at, responded_at
      FROM leads
      WHERE id = ${leadId} AND realtor_id = ${realtorId}
      LIMIT 1
    `;

    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (lead.responded_at) return NextResponse.json({ error: "Already responded" }, { status: 409 });

    const now = new Date();
    const responseHours = (now.getTime() - new Date(lead.created_at).getTime()) / 3600000;

    // Mark responded
    await sql`
      UPDATE leads
      SET responded_at = NOW(), response_channel = ${channel}
      WHERE id = ${leadId}
    `;

    // Recalculate score_response_rate for this realtor
    // score_response_rate = (responded leads / total leads) * 200 — capped at 200
    const [rateResult] = await sql`
      SELECT
        COUNT(*)                                                         AS total,
        COUNT(*) FILTER (WHERE responded_at IS NOT NULL)                 AS responded
      FROM leads
      WHERE realtor_id = ${realtorId}
    `;

    const total = parseInt(rateResult.total, 10);
    const responded = parseInt(rateResult.responded, 10);
    const newResponseRate = total > 0
      ? Math.min(200, Math.round((responded / total) * 200))
      : 0;

    // score_response_speed: 0-200 based on how fast they reply
    // <1h=200, <4h=150, <12h=100, <24h=50, <48h=25, >=48h=0
    const speedScore =
      responseHours < 1  ? 200 :
      responseHours < 4  ? 150 :
      responseHours < 12 ? 100 :
      responseHours < 24 ? 50  :
      responseHours < 48 ? 25  : 0;

    // Recalculate max_listing_capacity based on tier + new response rate
    const [tierRow] = await sql`
      SELECT subscription_tier, score_tier_base, score_listing_activity,
             score_reviews, score_profile, score_tenure
      FROM users WHERE id = ${realtorId}
    `;

    let newMaxCapacity = 2; // default trial
    if (tierRow) {
      if (tierRow.subscription_tier === "pro") {
        newMaxCapacity = Math.min(10, 5 + Math.floor(newResponseRate / 50));
      } else if (tierRow.subscription_tier === "pro_plus") {
        newMaxCapacity = Math.min(15, 8 + Math.floor(newResponseRate / 50));
      } else if (tierRow.subscription_tier === "free_trial") {
        newMaxCapacity = 2;
      } else {
        newMaxCapacity = 1;
      }
    }

    // Compute new total realtor_score
    const newScore =
      (tierRow?.score_tier_base ?? 0) +
      newResponseRate +
      speedScore +
      (tierRow?.score_listing_activity ?? 0) +
      (tierRow?.score_reviews ?? 0) +
      (tierRow?.score_profile ?? 0) +
      (tierRow?.score_tenure ?? 0);

    // Update user scores and capacity in a single statement
    await sql`
      UPDATE users SET
        score_response_rate  = ${newResponseRate},
        score_response_speed = ${speedScore},
        realtor_score        = ${newScore},
        max_listing_capacity = ${newMaxCapacity}
      WHERE id = ${realtorId}
    `;

    return NextResponse.json({
      success: true,
      responseRate: newResponseRate,
      speedScore,
      newScore,
    });
  } catch (err) {
    console.error(`POST /api/realtors/leads/${leadId}/respond failed:`, err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

async function resolveRealtorId(request: NextRequest): Promise<string | null> {
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
