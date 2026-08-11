import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

/**
 * POST /api/shutterbug/jobs/[id]/complete
 * Marks a photography booking as completed. Only callable by the assigned shutterbug.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    let shutterbugId: string;
    try {
      const decrypted = decrypt(token);
      const payload = JSON.parse(decrypted);
      if (!payload.userId || payload.expiry < Date.now())
        return NextResponse.json({ success: false, error: "Token expired" }, { status: 401 });
      shutterbugId = payload.userId;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const [result] = await sql`
      UPDATE photography_bookings
      SET status = 'completed', updated_at = NOW()
      WHERE id = ${bookingId}
        AND assigned_shutterbug_id = ${shutterbugId}
        AND status IN ('confirmed', 'en_route')
      RETURNING id
    `;

    if (!result) {
      return NextResponse.json({ success: false, error: "Booking not found or already completed" }, { status: 404 });
    }

    // Also update listing status to active (photos delivered)
    await sql`
      UPDATE listings l
      SET status = 'active', updated_at = NOW()
      FROM photography_bookings pb
      WHERE pb.id = ${bookingId}
        AND l.id = pb.listing_id
        AND l.status = 'pending_photography'
    `;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[shutterbug/jobs/complete] error:", err);
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}
