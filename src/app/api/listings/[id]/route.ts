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
        r.subscription_tier   AS "realtorTier",
        (
          SELECT COUNT(*)::int
          FROM listings rl
          WHERE rl.assigned_realtor_id = l.assigned_realtor_id
            AND rl.status = 'active'
            AND (rl.created_at < l.created_at OR (rl.created_at = l.created_at AND rl.id <= l.id))
        )                     AS "realtorListingRank",
        l.description,
        l.year_built          AS "yearBuilt",
        l.maintenance,
        l.features,
        l.photos,
        l.property_specs      AS "propertySpecs",
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

    // Resolve contact helper for any listing row with Option B Starter Realtor Overflow Fallback:
    //  - Pro / Pro+ Realtors: unlimited active listings under their Realtor badge.
    //  - Starter (free_trial / soft_cap) Realtors: top 2 active listings under their Realtor badge;
    //    Listing #3+ falls back to Direct Owner (if rawContactPhone exists) or Blab Concierge
    //    so a Buyer NEVER hits a dead end or blocked contact.
    const resolveRow = (r: any) => {
      const specs = r.propertySpecs ?? {};
      const ownerPhone = r.rawContactPhone || specs.ownerFallbackPhone || null;
      const ownerName = r.rawContactName || specs.ownerFallbackName || null;

      let cName = ownerName;
      let cPhone = ownerPhone;
      let cPhoto = r.rawContactPhotoUrl ?? null;
      let handledByRealtor = false;
      let overflowFallbackApplied = false;

      if (r.assignedRealtorId) {
        const isPaidPro = r.realtorTier === "pro" || r.realtorTier === "pro_plus";
        const rank = Number(r.realtorListingRank ?? 1);
        const withinStarterCap = rank <= 2;

        if (isPaidPro || withinStarterCap) {
          handledByRealtor = true;
          if (r.realtorEncName) {
            try { cName = decrypt(r.realtorEncName); } catch {}
          }
          if (r.realtorEncPhone) {
            try { cPhone = decrypt(r.realtorEncPhone); } catch {}
          }
          cPhoto = r.realtorPhotoUrl ?? cPhoto;
        } else {
          // Option B Fallback: Starter Realtor is over their 2-listing Free cap.
          // Fall back to Direct Owner if phone is on file, else Blab Concierge Desk.
          overflowFallbackApplied = true;
          handledByRealtor = false;
          cName = ownerName ? `${ownerName} (Direct Owner)` : "Blab Concierge Desk";
          cPhone = ownerPhone || "+919849000111";
        }
      }

      // Ironclad Invariant #1: Never return an active listing without a callable contactName & contactPhone
      if (!cName) {
        cName = r.listerType === "developer" ? (r.societyName || "Builder Sales Desk") : "Verified Owner";
      }
      if (!cPhone) {
        cPhone = "+919849000111";
      }

      const {
        rawContactName, rawContactPhone, rawContactPhotoUrl,
        realtorEncName, realtorEncPhone, realtorPhotoUrl, realtorCompanyName,
        realtorTier, realtorListingRank,
        ...clean
      } = r;

      return {
        ...clean,
        contactName: cName,
        contactPhone: cPhone,
        contactPhotoUrl: cPhoto,
        handledByRealtor,
        overflowFallbackApplied,
      };
    };

    const currentUnit = resolveRow(row);

    // If this listing belongs to a named Society / Apartment Complex, fetch all active units
    // in that complex, split into:
    //   1. developerUnits (Builder units first, ordered first-come-first-served + floor plan configs)
    //   2. ownerUnits     (Owner/Realtor units, ordered strictly by created_at ASC — first-come, first-served)
    const developerUnits: any[] = [];
    const ownerUnits: any[] = [];

    if (row.propertyType === "apartment" && row.societyName && String(row.societyName).trim().length > 0) {
      const siblingRows = await sql`
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
          l.contact_name        AS "rawContactName",
          l.contact_phone       AS "rawContactPhone",
          l.contact_photo_url   AS "rawContactPhotoUrl",
          l.assigned_realtor_id AS "assignedRealtorId",
          r.encrypted_name      AS "realtorEncName",
          r.encrypted_phone     AS "realtorEncPhone",
          r.photo_url           AS "realtorPhotoUrl",
          r.company_name        AS "realtorCompanyName",
          r.subscription_tier   AS "realtorTier",
          (
            SELECT COUNT(*)::int
            FROM listings rl
            WHERE rl.assigned_realtor_id = l.assigned_realtor_id
              AND rl.status = 'active'
              AND (rl.created_at < l.created_at OR (rl.created_at = l.created_at AND rl.id <= l.id))
          )                     AS "realtorListingRank",
          l.description,
          l.year_built          AS "yearBuilt",
          l.maintenance,
          l.features,
          l.photos,
          l.property_specs      AS "propertySpecs",
          l.market_estimate     AS "marketEstimate",
          l.created_at          AS "createdAt"
        FROM listings l
        LEFT JOIN users r ON r.id = l.assigned_realtor_id
        WHERE l.society_name = ${row.societyName}
          AND l.status = 'active'
        ORDER BY
          CASE WHEN l.lister_type = 'developer' THEN 0 ELSE 1 END ASC,
          l.created_at ASC
        LIMIT 25
      `;

      const BUILDER_PHOTOS = [
        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80",
      ];

      for (const sib of siblingRows) {
        const resolved = resolveRow(sib);
        if (resolved.listerType === "developer") {
          const configs: any[] = Array.isArray(resolved.propertySpecs?.builderConfigs)
            ? resolved.propertySpecs.builderConfigs
            : [];
          if (configs.length > 0) {
            configs.forEach((cfg, idx) => {
              const bhkMatch = String(cfg.bhk || "").match(/(\d+)/);
              const beds = bhkMatch ? parseInt(bhkMatch[1], 10) : resolved.bedrooms;
              developerUnits.push({
                ...resolved,
                id: idx === 0 ? resolved.id : `${resolved.id}__cfg_${idx}`,
                unitLabel: cfg.bhk || `${beds} BHK`,
                unitsAvailable: cfg.unitsAvailable ?? null,
                price: cfg.priceInr || resolved.price,
                bedrooms: beds,
                builtUpArea: cfg.areaSqft || resolved.builtUpArea,
                carpetArea: cfg.areaSqft ? Math.round(cfg.areaSqft * 0.82) : resolved.carpetArea,
                floorNumber: idx === 0 ? resolved.floorNumber : (resolved.floorNumber ?? 15) + idx * 4,
                facing: String(cfg.bhk || "").includes("West") ? "W" : resolved.facing || "E",
                imageUrl: BUILDER_PHOTOS[idx % BUILDER_PHOTOS.length],
              });
            });
          } else {
            developerUnits.push({
              ...resolved,
              unitLabel: resolved.bedrooms ? `${resolved.bedrooms} BHK` : "Builder Unit",
            });
          }
        } else {
          ownerUnits.push({
            ...resolved,
            unitLabel: resolved.bedrooms ? `${resolved.bedrooms} BHK` : "Owner Unit",
          });
        }
      }
    }

    // If the user explicitly navigated to a specific unit ID (e.g. an Owner unit or specific config),
    // highlight that unit; if they tapped the society marker (which carries the #1 priority ID),
    // it naturally resolves to developerUnits[0] ?? ownerUnits[0].
    const allSocietyUnits = [...developerUnits, ...ownerUnits];
    const requestedMatch = allSocietyUnits.find((u) => u.id === id);
    const primaryUnit = requestedMatch ?? developerUnits[0] ?? ownerUnits[0] ?? currentUnit;

    return NextResponse.json({
      ...primaryUnit,
      developerUnits,
      ownerUnits,
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
