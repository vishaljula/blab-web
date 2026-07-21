import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized. Missing token." }, { status: 401 });
    }

    let payload: any;
    try {
      const decrypted = decrypt(token);
      payload = JSON.parse(decrypted);
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized. Invalid token." }, { status: 401 });
    }

    if (!payload.userId || !payload.expiry || payload.expiry < Date.now()) {
      return NextResponse.json({ success: false, error: "Unauthorized. Token expired." }, { status: 401 });
    }

    const { name, role, reraNumber, companyName, projectCount } = await request.json();
    if (!name || !role) {
      return NextResponse.json({ success: false, error: "Name and Role are required" }, { status: 400 });
    }

    const db = getDb();
    
    // Encrypt the fields at application level
    const encryptedName = encrypt(name);

    await db
      .update(users)
      .set({
        encryptedName,
        role: role,
        reraNumber: role === "realtor" || role === "developer" ? reraNumber || null : null,
        companyName: role === "realtor" || role === "developer" ? companyName || null : null,
        projectCount: role === "developer" ? projectCount || null : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, payload.userId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("onboarding route error:", error);
    return NextResponse.json({ success: false, error: error.message || "Server error" }, { status: 500 });
  }
}
