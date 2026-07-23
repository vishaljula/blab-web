import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { listings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;

    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const dbUrl = process.env.DATABASE_URL_POOL ?? process.env.DATABASE_URL;
    if (!dbUrl) return NextResponse.json({ error: "DB not configured" }, { status: 500 });
    const sql = neon(dbUrl);

    // Join the assigned realtor so we can serve their contact details when present.
    // If no realtor is assigned (self-list path), fall back to listing contact_* columns.
    const rows = await sql`
      SELECT
        l.id, l.latitude, l.longitude, l.price, l.status,
        l.property_type       AS "propertyType",
        l.listing_type        AS "listingType",
        l.lister_type         AS "listerType",
        l.listing_path        AS "listingPath",
        l.bedrooms, l.bathrooms,
        l.built_up_area       AS "builtUpArea",
        l.carpet_area         AS "carpetArea",
        l.plot_area           AS "plotArea",
        l.area_unit           AS "areaUnit",
        l.floor_number        AS "floorNumber",
        l.total_floors        AS "totalFloors",
        l.society_name        AS "societyName",
        l.facing, l.negotiable,
        l.security_deposit    AS "securityDeposit",
        l.available_from      AS "availableFrom",
        l.furnishing,
        l.preferred_tenant    AS "preferredTenant",
        l.address, l.city,
        l.image_url           AS "imageUrl",
        -- Contact: prefer assigned realtor over raw listing contact
        l.contact_name        AS "rawContactName",
        l.contact_phone       AS "rawContactPhone",
        l.contact_photo_url   AS "rawContactPhotoUrl",
        -- Realtor fields (NULL when no realtor assigned)
        l.assigned_realtor_id AS "assignedRealtorId",
        r.encrypted_name      AS "realtorEncName",
        r.encrypted_phone     AS "realtorEncPhone",
        r.photo_url           AS "realtorPhotoUrl",
        r.company_name        AS "realtorCompanyName",
        l.description,
        l.year_built          AS "yearBuilt",
        l.maintenance,
        l.features,
        l.market_estimate     AS "marketEstimate",
        l.expires_at          AS "expiresAt"
      FROM listings l
      LEFT JOIN users r ON r.id = l.assigned_realtor_id
      WHERE l.id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const row = rows[0] as any;

    // Resolve contact: realtor takes priority when assigned
    let contactName     = row.rawContactName     ?? null;
    let contactPhone    = row.rawContactPhone    ?? null;
    let contactPhotoUrl = row.rawContactPhotoUrl ?? null;

    if (row.assignedRealtorId && row.realtorEncName) {
      try { contactName = decrypt(row.realtorEncName); } catch (e) {
        console.warn(`[listing/${id}] Failed to decrypt realtor name:`, e);
      }
      if (row.realtorEncPhone) {
        try { contactPhone = decrypt(row.realtorEncPhone); } catch (e) {
          console.warn(`[listing/${id}] Failed to decrypt realtor phone:`, e);
        }
      }
      contactPhotoUrl = row.realtorPhotoUrl ?? contactPhotoUrl;
    }

    // Strip internal fields before sending to client
    const {
      rawContactName, rawContactPhone, rawContactPhotoUrl,
      realtorEncName, realtorEncPhone, realtorPhotoUrl, realtorCompanyName,
      ...rest
    } = row;

    return NextResponse.json({
      ...rest,
      contactName,
      contactPhone,
      contactPhotoUrl,
      // Surface whether a realtor is handling this listing (useful for UI labels)
      handledByRealtor: !!row.assignedRealtorId,
    });
  } catch (error: any) {
    console.error("Error fetching listing by ID:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/listings/[id]
 *
 * Partial update for a listing. Allowed callers:
 *   - The listing's owner (listerId === session.user.id)
 *   - The assigned realtor (assignedRealtorId === session.user.id)
 *
 * Typically used by realtors to complete draft listings with full details,
 * and by owners to renew / mark-as-closed an expiring listing.
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const { id } = await props.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const db = getDb();

    // Verify the caller is the lister OR the assigned realtor
    const existing = await db.query.listings.findFirst({
      where: eq(listings.id, id),
      columns: { listerId: true, assignedRealtorId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (existing.listerId !== userId && existing.assignedRealtorId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build the update payload from allowed fields only (never let callers overwrite listerId)
    const updateData: Partial<typeof listings.$inferInsert> = {};
    const allowed = [
      "price", "propertyType", "listingType", "listerType", "status",
      "address", "city", "latitude", "longitude",
      "floorNumber", "totalFloors", "societyName", "facing",
      "bedrooms", "bathrooms", "builtUpArea", "carpetArea", "plotArea", "areaUnit",
      "negotiable", "maintenance", "securityDeposit", "availableFrom",
      "furnishing", "preferredTenant",
      "description", "features", "imageUrl",
      "contactName", "contactPhone", "contactPhotoUrl",
      "listingPath", "assignedRealtorId",
      "expiresAt",
    ] as const;

    for (const key of allowed) {
      if (key in body) {
        (updateData as any)[key] = body[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(listings)
      .set(updateData)
      .where(eq(listings.id, id))
      .returning({ id: listings.id, status: listings.status });

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    console.error("PATCH /api/listings/[id] failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
