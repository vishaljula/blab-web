import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { encrypt, decrypt } from "@/lib/crypto";

const g = globalThis as unknown as {
  __devNavTarget?: { route: string; id: number; auth?: { token: string; user: any } | null } | null;
};

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ route: null });
  }
  const target = g.__devNavTarget ?? null;
  g.__devNavTarget = null; // consume once
  return NextResponse.json({ target });
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Dev only" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  let auth: { token: string; user: any } | null = null;

  if (body.role && process.env.DATABASE_URL) {
    const sql = neon(process.env.DATABASE_URL);
    const [u] = await sql`
      SELECT id, role, encrypted_name, encrypted_phone, company_name, rera_number
      FROM users
      WHERE role = ${body.role}
      LIMIT 1
    `;
    if (u) {
      let name = "Blab Partner";
      let phone = "+919849012345";
      try { if (u.encrypted_name) name = decrypt(u.encrypted_name); } catch {}
      try { if (u.encrypted_phone) phone = decrypt(u.encrypted_phone); } catch {}
      const token = encrypt(
        JSON.stringify({
          userId: u.id,
          role: u.role,
          expiry: Date.now() + 30 * 86_400_000,
        })
      );
      auth = {
        token,
        user: {
          id: u.id,
          role: u.role,
          name,
          phone,
          companyName: u.company_name,
          reraNumber: u.rera_number,
        },
      };
    }
  }

  if (body.route) {
    g.__devNavTarget = { route: String(body.route), id: Date.now(), auth };
  }
  return NextResponse.json({ success: true, target: g.__devNavTarget });
}

