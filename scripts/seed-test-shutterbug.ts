/**
 * seed-test-shutterbug.ts
 *
 * Creates a virtual test shutterbug user in Neon and prints a valid auth token
 * you can use with simulate-shutterbug.ts.
 *
 * Usage:
 *   npx tsx scripts/seed-test-shutterbug.ts
 *
 * Run from the project root (blab-web/).
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import * as crypto from "crypto";

// ─── Re-implement encrypt/decrypt inline so we don't need tsconfig paths ──────
const ALGORITHM = "aes-256-gcm";
function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY || "";
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 64 hex chars");
  return key;
}
function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}
function makeToken(userId: string): string {
  const payload = JSON.stringify({
    userId,
    expiry: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
  });
  return encrypt(payload);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const TEST_PHONE = "+910000000099"; // clearly fake number
  const TEST_NAME  = "Virtual Shutterbug (Test)";
  const TEST_PHONE_HASH = crypto.createHash("sha256").update(TEST_PHONE).digest("hex");

  // Check if it already exists
  const [existing] = await sql`
    SELECT id, push_token FROM users WHERE phone_hash = ${TEST_PHONE_HASH} LIMIT 1
  `;

  let shutterbugId: string;

  if (existing) {
    console.log("✔ Virtual shutterbug already exists — reusing.");
    shutterbugId = existing.id;
  } else {
    const encryptedName  = encrypt(TEST_NAME);
    const encryptedPhone = encrypt(TEST_PHONE);

    const [newUser] = await sql`
      INSERT INTO users (encrypted_name, encrypted_phone, phone_hash, role)
      VALUES (${encryptedName}, ${encryptedPhone}, ${TEST_PHONE_HASH}, 'shutterbug')
      RETURNING id
    `;
    shutterbugId = newUser.id;
    console.log("✔ Virtual shutterbug created.");
  }

  // Generate a long-lived auth token (same format as the mobile auth routes use)
  const token = makeToken(shutterbugId);

  // Update: set a fake push token so the booking dispatch assigns jobs to this user
  const fakePushToken = `ExponentPushToken[TEST_${shutterbugId.slice(0, 8)}]`;
  await sql`
    UPDATE users
    SET push_token = ${fakePushToken}, last_dispatched_at = NULL, updated_at = NOW()
    WHERE id = ${shutterbugId}
  `;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📸  VIRTUAL SHUTTERBUG READY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  User ID    : ${shutterbugId}`);
  console.log(`  Push token : ${fakePushToken}`);
  console.log(`\n  Auth token (copy this for simulate-shutterbug.ts):`);
  console.log(`  ${token}`);
  console.log("\n  Next steps:");
  console.log("  1. Make sure 'npm run dev' is running (localhost:3000)");
  console.log("  2. Book a photography shoot via the app (use a LB Nagar address)");
  console.log("     → The booking will be auto-assigned to this shutterbug");
  console.log("     → Grab the booking ID from the console or DB");
  console.log("  3. Run: npx tsx scripts/simulate-shutterbug.ts \\");
  console.log(`       --token "<paste token above>" \\`);
  console.log("       --booking-id <booking UUID>");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
