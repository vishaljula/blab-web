import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { decrypt } from "@/lib/crypto";

/**
 * POST /api/users/push-token
 *
 * Saves or updates the Expo push notification token for the authenticated user.
 * Called immediately after shutterbug onboarding to enable job dispatch.
 *
 * Body: { pushToken: "ExponentPushToken[...]" }
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    let userId: string;
    try {
      const decrypted = decrypt(token);
      const payload = JSON.parse(decrypted);
      if (!payload.userId || payload.expiry < Date.now())
        return NextResponse.json({ success: false, error: "Token expired" }, { status: 401 });
      userId = payload.userId;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });
    }

    const { pushToken } = await request.json();
    if (!pushToken || typeof pushToken !== "string") {
      return NextResponse.json({ success: false, error: "pushToken is required" }, { status: 400 });
    }

    // Validate it's an Expo token format
    if (!pushToken.startsWith("ExponentPushToken[") && !pushToken.startsWith("ExpoPushToken[")) {
      return NextResponse.json({ success: false, error: "Invalid Expo push token format" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      UPDATE users
      SET push_token = ${pushToken}, updated_at = NOW()
      WHERE id = ${userId}
    `;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[users/push-token] error:", err);
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/users/push-token
 * Clears the push token on logout so offline shutterbugs don't receive jobs.
 */
export async function DELETE(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    let userId: string;
    try {
      const decrypted = decrypt(token);
      const payload = JSON.parse(decrypted);
      if (!payload.userId || payload.expiry < Date.now())
        return NextResponse.json({ success: false, error: "Token expired" }, { status: 401 });
      userId = payload.userId;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid token" }, { status: 401 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    await sql`UPDATE users SET push_token = NULL, updated_at = NOW() WHERE id = ${userId}`;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}
