import { NextResponse } from "next/server";
import { getMapplsAccessToken } from "@/lib/mappls";

/**
 * GET /api/mappls/token
 *
 * Returns a Mappls OAuth access token for client-side map initialization.
 */
export async function GET() {
  try {
    const token = await getMapplsAccessToken();
    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ error: "Token fetch failed" }, { status: 500 });
  }
}
