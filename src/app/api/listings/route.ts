import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { listings } from "@/db/schema";
import { neon } from "@neondatabase/serverless";

/**
 * POST /api/listings
 *
 * Creates a new property listing. Auth-gated — requires a valid session.
 *
 * Self-list path:  status = "pending_photography" (set by default in schema).
 *                  Listing goes live after Blab team photographs + approves it.
 * Realtor path:    status = "draft". Assigned realtor completes the details
 *                  and publishes it.
 *
 * Body shape mirrors the Listing type from the form wizard. All optional
 * fields are coerced to null/undefined if missing so the DB insert is clean.
 */
export async function POST(request: NextRequest) {
  // ── Auth gate ──────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Required field validation ───────────────────────────────────────────────
  const { listingType, propertyType, listerType, address, city, latitude, longitude, price } = body;

  if (!listingType || !propertyType || !listerType || !address || !city) {
    return NextResponse.json(
      { error: "Missing required fields: listingType, propertyType, listerType, address, city" },
      { status: 400 }
    );
  }
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json(
      { error: "latitude and longitude must be numbers" },
      { status: 400 }
    );
  }
  if (typeof price !== "number" || price < 0) {
    return NextResponse.json(
      { error: "price must be a non-negative number" },
      { status: 400 }
    );
  }

  // ── Insert ─────────────────────────────────────────────────────────────────
  try {
    const db = getDb();

    const listingPath = (body.listingPath as string) ?? "self";
    // Realtor-path listings start as drafts (realtor completes them).
    // Self-list listings start as pending_photography (photographer must visit).
    const status = listingPath === "realtor" ? "draft" : "pending_photography";

    const [created] = await db
      .insert(listings)
      .values({
        listerId: userId,
        latitude: latitude as number,
        longitude: longitude as number,
        price: price as number,
        propertyType: propertyType as string,
        listingType: listingType as string,
        listerType: listerType as string,
        status: status as any,

        // Location
        address: address as string,
        city: city as string,
        floorNumber: (body.floorNumber as number) ?? null,
        totalFloors: (body.totalFloors as number) ?? null,
        societyName: (body.societyName as string) ?? null,
        facing: (body.facing as string) ?? null,

        // Size
        bedrooms: (body.bedrooms as number) ?? null,
        bathrooms: (body.bathrooms as number) ?? null,
        builtUpArea: (body.builtUpArea as number) ?? null,
        carpetArea: (body.carpetArea as number) ?? null,
        plotArea: (body.plotArea as number) ?? null,
        areaUnit: (body.areaUnit as string) ?? "sqft",

        // Price & terms
        negotiable: (body.negotiable as boolean) ?? true,
        maintenance: (body.maintenance as number) ?? null,
        securityDeposit: (body.securityDeposit as number) ?? null,
        availableFrom: body.availableFrom ? new Date(body.availableFrom as string) : null,

        // Rental-specific
        furnishing: (body.furnishing as string) ?? null,
        preferredTenant: (body.preferredTenant as string) ?? null,

        // Listing path
        listingPath: listingPath,
        assignedRealtorId: (body.assignedRealtorId as string) ?? null,

        // Media & contact (populated later by photographer / realtor)
        description: (body.description as string) ?? null,
        contactName: (body.contactName as string) ?? null,
        contactPhone: (body.contactPhone as string) ?? null,
        features: (body.features as any) ?? null,
        yearBuilt: (body.yearBuilt as number) ?? null,
      })
      .returning({ id: listings.id, status: listings.status });

    // ── Seller-lead trial counter ─────────────────────────────────────────────
    // When a seller picks a realtor (assignedRealtorId) during the realtor listing
    // path, this is the "seller lead" for that realtor. Increment their trial cap
    // counter here — NOT in the buyer-contact flow.
    const assignedRealtorId = (body.assignedRealtorId as string) ?? null;
    if (assignedRealtorId && listingPath === "realtor") {
      try {
        const rawSql = neon(process.env.DATABASE_URL!);
        const [rt] = await rawSql`
          SELECT subscription_tier FROM users
          WHERE id = ${assignedRealtorId} AND role = 'realtor'
          LIMIT 1
        `;
        if (rt?.subscription_tier === "free_trial") {
          if (listingType === "sale") {
            await rawSql`UPDATE users SET trial_sale_leads_used = trial_sale_leads_used + 1 WHERE id = ${assignedRealtorId}`;
          } else {
            await rawSql`UPDATE users SET trial_rental_leads_used = trial_rental_leads_used + 1 WHERE id = ${assignedRealtorId}`;
          }
          // If both caps hit, graduate to soft_cap
          const [updated] = await rawSql`
            SELECT trial_sale_leads_used, trial_rental_leads_used FROM users WHERE id = ${assignedRealtorId}
          `;
          if ((updated.trial_sale_leads_used ?? 0) >= 3 && (updated.trial_rental_leads_used ?? 0) >= 3) {
            await rawSql`UPDATE users SET subscription_tier = 'soft_cap' WHERE id = ${assignedRealtorId}`;
          }
        }
      } catch (tierErr) {
        // Non-fatal — listing is already created; just log the failure
        console.error("Seller-lead trial counter update failed:", tierErr);
      }
    }

    return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
  } catch (err) {
    console.error("POST /api/listings failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
