import { NextResponse } from "next/server";
import { verifyOTP } from "@/lib/sms";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashString, encrypt, decrypt } from "@/lib/crypto";

export async function POST(request: Request) {
  try {
    const { phone, code } = await request.json();
    if (!phone || !code) {
      return NextResponse.json({ success: false, error: "Phone and code are required" }, { status: 400 });
    }

    // ── Dev bypass ────────────────────────────────────────────────────────────
    // Accepts OTP 123456 for any phone in local development ONLY.
    // Requires BOTH conditions simultaneously — double guard against accidents:
    //   1. NODE_ENV !== 'production'  (Vercel production sets this automatically)
    //   2. DEV_OTP_BYPASS === 'true'  (must be set explicitly in .env.local, which is gitignored)
    // NEVER add DEV_OTP_BYPASS to Vercel production environment variables.
    const isDevBypass =
      process.env.NODE_ENV !== "production" &&
      process.env.DEV_OTP_BYPASS === "true" &&
      code === "123456";

    const isVerified = isDevBypass || (await verifyOTP(phone, code));
    if (!isVerified) {
      return NextResponse.json({ success: false, error: "Invalid OTP code" }, { status: 400 });
    }


    const phoneHash = hashString(phone);
    const db = getDb();

    // Query or register user (progressive onboarding)
    let user = await db.query.users.findFirst({
      where: eq(users.phoneHash, phoneHash),
    });

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({
          phoneHash,
          encryptedPhone: encrypt(phone),
          role: "buyer",
        })
        .returning();
      user = newUser;
    }

    // Return decrypted profile info
    const profile = {
      id: user.id,
      role: user.role,
      phone: phone,
      name: user.encryptedName ? decrypt(user.encryptedName) : null,
      email: user.encryptedEmail ? decrypt(user.encryptedEmail) : null,
      reraNumber: user.reraNumber || null,
      companyName: user.companyName || null,
      projectCount: user.projectCount || null,
    };

    // Generate self-contained encrypted token for authorization session
    const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    const tokenPayload = JSON.stringify({ userId: user.id, expiry });
    const token = encrypt(tokenPayload);

    return NextResponse.json({ success: true, token, user: profile });
  } catch (error: any) {
    console.error("verify-otp route error:", error);
    return NextResponse.json({ success: false, error: error.message || "Server error" }, { status: 500 });
  }
}
