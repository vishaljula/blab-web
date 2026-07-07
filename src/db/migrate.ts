import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not defined");
    process.exit(1);
  }

  console.log("Connecting to Neon...");
  const sql = neon(databaseUrl);

  console.log("Applying schema updates...");
  try {
    // 1. Create enum type user_role if not exists
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
          CREATE TYPE "public"."user_role" AS ENUM('buyer', 'owner', 'broker', 'developer');
        END IF;
      END
      $$;
    `;
    console.log("✔ Checked/Created 'user_role' enum");

    // 2. Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "role" "user_role" DEFAULT 'buyer' NOT NULL,
        "phone_hash" varchar(64),
        "email_hash" varchar(64),
        "encrypted_name" text,
        "encrypted_phone" text,
        "encrypted_email" text,
        "rera_number" varchar(50),
        "company_name" varchar(100),
        "project_count" varchar(20),
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "users_phone_hash_unique" UNIQUE("phone_hash")
      );
    `;
    console.log("✔ Checked/Created 'users' table");

    // 3. Add lister_id column to listings
    await sql`
      ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "lister_id" uuid;
    `;
    console.log("✔ Checked/Added 'lister_id' column to 'listings'");

    // 4. Add foreign key constraint if not exists
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 
          FROM information_schema.table_constraints 
          WHERE constraint_name = 'listings_lister_id_users_id_fk'
        ) THEN
          ALTER TABLE "listings" 
          ADD CONSTRAINT "listings_lister_id_users_id_fk" 
          FOREIGN KEY ("lister_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `;
    console.log("✔ Checked/Added foreign key constraint");

    // 5. Add indexes
    await sql`CREATE INDEX IF NOT EXISTS "idx_listings_lister" ON "listings" USING btree ("lister_id");`;
    await sql`CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" USING btree ("role");`;
    console.log("✔ Checked/Created indexes");

    // ── Listing form fields (added for multi-step listing wizard) ──────────────

    // listing_status enum
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_status') THEN
          CREATE TYPE "public"."listing_status" AS ENUM('draft', 'pending_photography', 'active', 'expired', 'closed');
        END IF;
      END
      $$;
    `;
    console.log("✔ Checked/Created 'listing_status' enum");

    // Status & lifecycle
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "status" "listing_status" DEFAULT 'pending_photography' NOT NULL;`;
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "expires_at" timestamp;`;

    // Size
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "carpet_area" integer;`;
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "area_unit" varchar(10);`;

    // Location detail
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "floor_number" integer;`;
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "total_floors" integer;`;
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "society_name" varchar(150);`;
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "facing" varchar(20);`;

    // Pricing & terms
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "negotiable" boolean DEFAULT true;`;
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "security_deposit" integer;`;
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "available_from" timestamp;`;

    // Rental-specific
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "furnishing" varchar(20);`;
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "preferred_tenant" varchar(20);`;

    // Listing path & realtor assignment
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "listing_path" varchar(10);`;
    await sql`ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "assigned_realtor_id" uuid;`;
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'listings_assigned_realtor_id_users_id_fk'
        ) THEN
          ALTER TABLE "listings"
          ADD CONSTRAINT "listings_assigned_realtor_id_users_id_fk"
          FOREIGN KEY ("assigned_realtor_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `;
    console.log("✔ Added listing wizard columns");

    console.log("Migration completed successfully!");

  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

run();
