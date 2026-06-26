import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;

    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    // Fail early with a clear message rather than throwing deep inside neon()
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return NextResponse.json({ error: "DB not configured" }, { status: 500 });
    const sql = neon(dbUrl);

    // Aliases convert snake_case DB columns to camelCase expected by the Listing interface
    const rows = await sql`
      SELECT
        id, latitude, longitude, price,
        property_type AS "propertyType",
        listing_type AS "listingType",
        lister_type AS "listerType",
        bedrooms, bathrooms,
        built_up_area AS "builtUpArea",
        plot_area AS "plotArea",
        address, city, image_url AS "imageUrl",
        contact_name AS "contactName",
        contact_phone AS "contactPhone",
        contact_photo_url AS "contactPhotoUrl",
        description,
        year_built AS "yearBuilt",
        maintenance,
        features,
        market_estimate AS "marketEstimate"
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
