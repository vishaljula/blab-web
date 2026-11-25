import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt, encrypt } from "@/lib/crypto";
import { ensureDailyShifts } from "@/lib/photography-dispatch";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(decrypt(token));
    } catch {
      return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });
    }

    if (!payload.userId || !payload.expiry || payload.expiry < Date.now()) {
      return NextResponse.json({ success: false, error: "Token expired" }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      role,
      reraNumber,
      companyName,
      projectCount,
      subscriptionTier,
    } = body;

    if (!role) {
      return NextResponse.json({ success: false, error: "Role is required" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const [existing] = await sql`
      SELECT id, encrypted_name, encrypted_phone, encrypted_email, rera_number, company_name, subscription_tier
      FROM users
      WHERE id = ${payload.userId}::uuid
      LIMIT 1
    `;
    if (!existing) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const resolvedName =
      name?.trim() ||
      (existing.encrypted_name ? decrypt(existing.encrypted_name) : "Blab Member");
    const encryptedName = encrypt(resolvedName);
    const targetTier =
      role === "realtor" ? (subscriptionTier || "pro") : existing.subscription_tier || "free_trial";

    await sql`
      UPDATE users
      SET encrypted_name       = ${encryptedName},
          role                 = ${role},
          rera_number          = COALESCE(${reraNumber || null}, rera_number),
          company_name         = COALESCE(${companyName || null}, company_name),
          project_count        = COALESCE(${projectCount || null}, project_count),
          subscription_tier    = ${targetTier},
          realtor_latitude     = COALESCE(realtor_latitude, 17.4326),
          realtor_longitude    = COALESCE(realtor_longitude, 78.3744),
          realtor_score        = CASE WHEN ${role} = 'realtor' THEN GREATEST(COALESCE(realtor_score, 0), 5000) ELSE realtor_score END,
          score_tier_base      = CASE WHEN ${role} = 'realtor' THEN 5000 ELSE score_tier_base END,
          max_listing_capacity = CASE WHEN ${role} = 'realtor' THEN 10 ELSE max_listing_capacity END,
          updated_at           = NOW()
      WHERE id = ${payload.userId}::uuid
    `;

    if (role === "realtor") {
      await sql`
        INSERT INTO payment_orders (
          user_id, order_type, base_amount_inr, discount_inr, payable_inr, promo_code, status
        ) VALUES (
          ${payload.userId}::uuid, 'realtor_pro', 2999, 2999, 0, 'LAUNCH_PRO_3M', 'paid'
        )
      `.catch(() => {});
    }

    if (role === "shutterbug") {
      await sql`
        INSERT INTO shutterbug_profiles (user_id, display_name, dispatch_enabled, home_lat, home_lng)
        VALUES (${payload.userId}::uuid, ${resolvedName}, true, 17.3850, 78.4867)
        ON CONFLICT (user_id) DO UPDATE
        SET display_name = EXCLUDED.display_name, dispatch_enabled = true, updated_at = NOW()
      `;
      const todayIso = new Date(Date.now() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 10);
      await ensureDailyShifts(sql, [todayIso]).catch(() => {});
    }

    const phone = existing.encrypted_phone ? decrypt(existing.encrypted_phone) : null;
    const email = existing.encrypted_email ? decrypt(existing.encrypted_email) : null;

    return NextResponse.json({
      success: true,
      user: {
        id: payload.userId,
        role,
        name: resolvedName,
        phone,
        email,
        reraNumber: reraNumber || existing.rera_number || null,
        companyName: companyName || existing.company_name || null,
        subscriptionTier: targetTier,
      },
    });
  } catch (error: any) {
    console.error("onboarding route error:", error);
    return NextResponse.json({ success: false, error: error.message || "Server error" }, { status: 500 });
  }
}
