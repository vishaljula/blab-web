import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { listings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;

    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return NextResponse.json({ error: "DB not configured" }, { status: 500 });
    const sql = neon(dbUrl);

    // Aliases convert snake_case DB columns to camelCase expected by the Listing interface
    const rows = await sql`
      SELECT
        id, latitude, longitude, price, status,
        property_type       AS "propertyType",
        listing_type        AS "listingType",
        lister_type         AS "listerType",
        listing_path        AS "listingPath",
        bedrooms, bathrooms,
        built_up_area       AS "builtUpArea",
        carpet_area         AS "carpetArea",
        plot_area           AS "plotArea",
        area_unit           AS "areaUnit",
        floor_number        AS "floorNumber",
        total_floors        AS "totalFloors",
        society_name        AS "societyName",
        facing, negotiable,
        security_deposit    AS "securityDeposit",
        available_from      AS "availableFrom",
        furnishing,
        preferred_tenant    AS "preferredTenant",
        address, city,
        image_url           AS "imageUrl",
        contact_name        AS "contactName",
        contact_phone       AS "contactPhone",
        contact_photo_url   AS "contactPhotoUrl",
        description,
        year_built          AS "yearBuilt",
        maintenance,
        features,
        market_estimate     AS "marketEstimate",
        expires_at          AS "expiresAt"
      FROM listings
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
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
