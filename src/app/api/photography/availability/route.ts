import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { buildAvailabilityResponse } from "@/lib/photography-dispatch";

/**
 * GET /api/photography/availability?lat=17.385&lng=78.486&days=10&propertyType=apartment&unitCount=1
 *
 * Route-aware, shift-backed availability engine:
 *  - Checks 65 km Greater Hyderabad + ORR + 25 km service zone via PostGIS ST_DWithin
 *  - Evaluates actual shift intervals, preceding/following travel feasibility, and solar daylight cutoff
 *  - Returns conditional `expressSlot` when an online Shutterbug is within range right now
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");
    const daysParam = parseInt(searchParams.get("days") ?? "10", 10);
    const propertyType = searchParams.get("propertyType") ?? "apartment";
    const unitCount = parseInt(searchParams.get("unitCount") ?? "1", 10);

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { success: false, error: "lat and lng are required" },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);
    const payload = await buildAvailabilityResponse(sql, {
      lat,
      lng,
      daysParam,
      propertyType,
      unitCount,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[GET /api/photography/availability]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
