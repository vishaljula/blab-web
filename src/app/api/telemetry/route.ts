import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * POST /api/telemetry
 * GET  /api/telemetry
 *
 * Lightweight "Silent 70% Telemetry & Funnel Friction Watchdog" ingestion & synthesis API.
 * Captures micro-events that traditional CRUD tables miss:
 *  - wizard_step_view / wizard_abandon (Steps 1–5 of posting)
 *  - listing_view / society_unit_switch / photo_lightbox_open
 *  - contact_click_call / contact_click_whatsapp / tour_request_click
 *  - realtor_overflow_fallback_hit (Buyer interacted with Starter Realtor's #3+ listing that fell back to Direct Owner)
 *  - realtor_handoff_cap_skipped (Starter Realtor skipped in Step4RealtorList due to 1-handoff cap)
 */

let tableEnsured = false;

export async function ensureTelemetryTable(sql: ReturnType<typeof neon>) {
  if (tableEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type varchar(64) NOT NULL,
      session_id varchar(64),
      user_id uuid,
      listing_id uuid,
      realtor_id uuid,
      step_name varchar(48),
      platform varchar(16) DEFAULT 'unknown',
      is_simulated boolean DEFAULT false,
      metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON telemetry_events (event_type, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_telemetry_listing ON telemetry_events (listing_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_telemetry_realtor ON telemetry_events (realtor_id)`;
  tableEnsured = true;
}

export async function POST(request: NextRequest) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ ok: false }, { status: 500 });

  try {
    const body = await request.json();
    const eventType = String(body.eventType || "").trim().slice(0, 64);
    if (!eventType) {
      return NextResponse.json({ error: "Missing eventType" }, { status: 400 });
    }

    const sql = neon(dbUrl);
    await ensureTelemetryTable(sql);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeUuid = (v: unknown) => (typeof v === "string" && uuidRegex.test(v) ? v : null);

    await sql`
      INSERT INTO telemetry_events (
        event_type, session_id, user_id, listing_id, realtor_id,
        step_name, platform, is_simulated, metadata
      ) VALUES (
        ${eventType},
        ${body.sessionId ? String(body.sessionId).slice(0, 64) : null},
        ${safeUuid(body.userId)},
        ${safeUuid(body.listingId)},
        ${safeUuid(body.realtorId)},
        ${body.stepName ? String(body.stepName).slice(0, 48) : null},
        ${body.platform ? String(body.platform).slice(0, 16) : "web"},
        ${Boolean(body.isSimulated)},
        ${JSON.stringify(body.metadata ?? {})}::jsonb
      )
    `;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.warn("[POST /api/telemetry] non-fatal error:", err?.message);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "No DB" }, { status: 500 });

  try {
    const sql = neon(dbUrl);
    await ensureTelemetryTable(sql);

    const [funnelRows, silentBuyerRows, fomoRows, totalRow] = await Promise.all([
      // 1. Post Wizard Step Funnel (Steps 1 → 5)
      sql`
        SELECT step_name AS "step", COUNT(*)::int AS "count"
        FROM telemetry_events
        WHERE event_type = 'wizard_step_view'
          AND step_name IS NOT NULL
          AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY step_name
      `,
      // 2. High-Intent Silent Buyers (Views + Unit Switches vs Contact Clicks)
      sql`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'listing_view')::int AS "listingViews",
          COUNT(*) FILTER (WHERE event_type = 'society_unit_switch')::int AS "unitSwitches",
          COUNT(*) FILTER (WHERE event_type = 'photo_lightbox_open')::int AS "lightboxOpens",
          COUNT(*) FILTER (WHERE event_type IN ('contact_click_call', 'contact_click_whatsapp', 'tour_request_click'))::int AS "contactClicks"
        FROM telemetry_events
        WHERE created_at > NOW() - INTERVAL '30 days'
      `,
      // 3. Realtor Paywall & Option B Overflow FOMO Hits
      sql`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'realtor_overflow_fallback_hit')::int AS "overflowFallbackHits",
          COUNT(*) FILTER (WHERE event_type = 'realtor_handoff_cap_skipped')::int AS "handoffCapSkipped"
        FROM telemetry_events
        WHERE created_at > NOW() - INTERVAL '30 days'
      `,
      sql`
        SELECT COUNT(*)::int AS "totalEvents"
        FROM telemetry_events
        WHERE created_at > NOW() - INTERVAL '30 days'
      `,
    ]);

    const stepMap: Record<string, number> = {};
    for (const r of funnelRows as any[]) {
      stepMap[r.step] = Number(r.count || 0);
    }

    const sb = (silentBuyerRows[0] as any) ?? {};
    const fomo = (fomoRows[0] as any) ?? {};
    const views = Number(sb.listingViews ?? 0);
    const contacts = Number(sb.contactClicks ?? 0);
    const silentDropPct = views > 0 ? Math.max(0, Math.round(((views - contacts) / views) * 100)) : 0;

    return NextResponse.json({
      totalEvents: Number((totalRow[0] as any)?.totalEvents ?? 0),
      wizardFunnel: [
        { step: "Step 1 · Type", key: "step1_type", count: stepMap["step1_type"] ?? 0 },
        { step: "Step 2 · Pin", key: "step2_location", count: stepMap["step2_location"] ?? 0 },
        { step: "Step 3 · Price", key: "step3_details", count: stepMap["step3_details"] ?? 0 },
        { step: "Step 4 · Path/Realtor", key: "step4_path", count: stepMap["step4_path"] ?? 0 },
        { step: "Step 5 · Shoot Booked", key: "step5_booked", count: stepMap["step5_booked"] ?? 0 },
      ],
      silentBuyers: {
        listingViews: views,
        unitSwitches: Number(sb.unitSwitches ?? 0),
        lightboxOpens: Number(sb.lightboxOpens ?? 0),
        contactClicks: contacts,
        silentDropPct,
      },
      realtorFomo: {
        overflowFallbackHits: Number(fomo.overflowFallbackHits ?? 0),
        handoffCapSkipped: Number(fomo.handoffCapSkipped ?? 0),
      },
    });
  } catch (err: any) {
    console.error("[GET /api/telemetry] error:", err);
    return NextResponse.json({ error: err.message ?? "Telemetry error" }, { status: 500 });
  }
}

