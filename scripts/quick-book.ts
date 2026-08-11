/**
 * quick-book.ts
 *
 * Creates a test photography booking against the virtual shutterbug WITHOUT
 * going through the full listing wizard. Useful for validating the tracking flow.
 *
 * Usage:
 *   npx tsx scripts/quick-book.ts
 *
 * Will:
 *   1. Find (or create) a test listing in LB Nagar
 *   2. Find the virtual shutterbug
 *   3. Create a photography booking for today's next available window
 *   4. Assign the booking to the virtual shutterbug
 *   5. Print the booking ID + tracking URL
 *
 * Run from project root (blab-web/).
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import * as crypto from "crypto";

// ── Inline encrypt (no tsconfig path aliases in scripts) ──────────────────────
const ALGORITHM = "aes-256-gcm";
function getKey() {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || "", "hex");
  if (key.length !== 32) throw new Error("Bad ENCRYPTION_KEY");
  return key;
}
function encrypt(text: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv) as crypto.CipherGCM;
  let enc = cipher.update(text, "utf8", "hex") + cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc}`;
}

// ── LB Nagar test property ─────────────────────────────────────────────────────
const TEST_PROPERTY = {
  address: "Flat 2B, Srinivasa Residency, Saroor Nagar, LB Nagar, Hyderabad 500074",
  lat: 17.3441,
  lng: 78.5512,
  h3Index: "87393568bffffff",  // res7 cell covering LB Nagar center
};

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("\n🔨  Quick-Book: Setting up test photography booking");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── 1. Find virtual shutterbug ────────────────────────────────────────────
  const testPhoneHash = crypto.createHash("sha256").update("+910000000099").digest("hex");
  const [shutterbug] = await sql`
    SELECT id, push_token FROM users
    WHERE phone_hash = ${testPhoneHash} AND role = 'shutterbug'
    LIMIT 1
  `;
  if (!shutterbug) {
    console.error("❌  Virtual shutterbug not found. Run this first:");
    console.error("     npx tsx scripts/seed-test-shutterbug.ts");
    process.exit(1);
  }
  console.log(`  ✔ Virtual shutterbug: ${shutterbug.id}`);

  // ── 2. Find or create a test customer (owner) ─────────────────────────────
  const CUSTOMER_PHONE_HASH = crypto.createHash("sha256").update("+910000000088").digest("hex");
  let [customer] = await sql`
    SELECT id FROM users WHERE phone_hash = ${CUSTOMER_PHONE_HASH} LIMIT 1
  `;
  if (!customer) {
    const [c] = await sql`
      INSERT INTO users (encrypted_name, encrypted_phone, phone_hash, role)
      VALUES (${encrypt("Test Owner")}, ${encrypt("+910000000088")}, ${CUSTOMER_PHONE_HASH}, 'owner')
      RETURNING id
    `;
    customer = c;
    console.log(`  ✔ Test customer created: ${customer.id}`);
  } else {
    console.log(`  ✔ Test customer: ${customer.id}`);
  }

  // ── 3. Find or create a test listing in LB Nagar ─────────────────────────
  let [listing] = await sql`
    SELECT id FROM listings
    WHERE lister_id = ${customer.id}
      AND address ILIKE '%Saroor Nagar%'
    LIMIT 1
  `;
  if (!listing) {
    const [l] = await sql`
      INSERT INTO listings
        (lister_id, lister_type, listing_type, property_type,
         address, city, latitude, longitude,
         price, status, bedrooms, bathrooms, carpet_area, area_unit)
      VALUES
        (${customer.id}, 'owner', 'sale', 'apartment',
         ${TEST_PROPERTY.address}, 'Hyderabad',
         ${TEST_PROPERTY.lat}, ${TEST_PROPERTY.lng},
         8500000, 'pending_photography', 3, 2, 1400, 'sqft')
      RETURNING id
    `;
    listing = l;
    console.log(`  ✔ Test listing created: ${listing.id}`);
  } else {
    console.log(`  ✔ Test listing: ${listing.id}`);
  }

  // ── 4. Pick next available slot ───────────────────────────────────────────
  const today = new Date();
  // Use today's date in IST (UTC+5:30)
  const istNow = new Date(today.getTime() + 5.5 * 60 * 60 * 1000);
  const slotDate = istNow.toISOString().slice(0, 10);
  const istHour  = istNow.getUTCHours();

  // Pick a window that hasn't started yet
  const windows = [
    { id: "A", startHour: 9  },
    { id: "B", startHour: 11 },
    { id: "C", startHour: 14 },
    { id: "D", startHour: 17 },
  ];
  let slotWindow = windows.find((w) => w.startHour > istHour)?.id ?? "A";

  // If all windows are past today, use tomorrow morning
  let finalSlotDate = slotDate;
  if (!windows.find((w) => w.startHour > istHour)) {
    const tomorrow = new Date(istNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    finalSlotDate = tomorrow.toISOString().slice(0, 10);
    slotWindow = "A";
  }

  console.log(`  ✔ Booking slot: ${finalSlotDate}  Window ${slotWindow}`);

  // ── 5. Insert the booking ─────────────────────────────────────────────────
  const [booking] = await sql`
    INSERT INTO photography_bookings
      (listing_id, customer_id, slot_date, slot_window, status,
       assigned_shutterbug_id, property_h3_cell, booking_source, customer_notes)
    VALUES
      (${listing.id}::uuid, ${customer.id}::uuid, ${finalSlotDate}, ${slotWindow},
       'confirmed',
       ${shutterbug.id}::uuid, ${TEST_PROPERTY.h3Index}, 'test',
       'TEST BOOKING — simulator will update live location')
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  // If conflict (already exists), get existing
  const bookingId = booking?.id ?? (await sql`
    SELECT id FROM photography_bookings
    WHERE listing_id = ${listing.id} AND slot_date = ${finalSlotDate}
      AND slot_window = ${slotWindow}
    LIMIT 1
  `)?.[0]?.id;

  // Mark shutterbug as last dispatched (so round-robin works correctly)
  await sql`
    UPDATE users SET last_dispatched_at = NOW() WHERE id = ${shutterbug.id}
  `;

  const trackingUrl = `http://localhost:3000/tracking/${bookingId}`;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯  TEST BOOKING READY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Booking ID  : ${bookingId}`);
  console.log(`  Slot        : ${finalSlotDate}  Window ${slotWindow}`);
  console.log(`  Property    : ${TEST_PROPERTY.address}`);
  console.log(`  Shutterbug  : ${shutterbug.id}`);
  console.log(`\n  Tracking URL (open in browser NOW):`);
  console.log(`  → ${trackingUrl}`);
  console.log(`\n  Then run the simulator (use the token from seed-test-shutterbug.ts):`);
  console.log(`  npx tsx scripts/simulate-shutterbug.ts \\`);
  console.log(`    --token "YOUR_SHUTTERBUG_TOKEN" \\`);
  console.log(`    --booking-id ${bookingId} \\`);
  console.log(`    --interval 5`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
