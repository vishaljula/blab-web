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

    // ── SCRUM-192: PostGIS GIST spatial index (BLAB-SPATIAL-01) ──────────────
    // PostGIS is already enabled on Neon — this is a safety no-op.
    console.log("→ Confirming PostGIS extension...");
    await sql`CREATE EXTENSION IF NOT EXISTS postgis;`;
    console.log("✔ PostGIS extension confirmed");

    // Drop the old separate B-tree indexes on lat/lng columns.
    // They cannot be used together for bounding-box queries (Postgres can only
    // use one at a time) and are superseded by the GIST index below.
    console.log("→ Dropping superseded lat/lng B-tree indexes...");
    await sql`DROP INDEX IF EXISTS idx_listings_lat;`;
    await sql`DROP INDEX IF EXISTS idx_listings_lng;`;
    console.log("✔ Dropped superseded lat/lng B-tree indexes");

    // Add a generated geography(POINT) column.
    // GENERATED ALWAYS AS ... STORED: Postgres auto-computes and stores the
    // value on every INSERT/UPDATE — no application-layer maintenance needed.
    // Cast to ::geography so the GIST index uses the sphere-aware geography
    // type (correct distance calculations across lat/lng boundaries).
    console.log("→ Adding generated 'location' geography column...");
    await sql`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS location geography(POINT, 4326)
        GENERATED ALWAYS AS (
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
        ) STORED;
    `;
    console.log("✔ Added generated 'location' geography column");

    // Create GIST index — enables O(log n) bounding-box and distance queries.
    // The && (bounding-box intersects) and ST_DWithin operators both use this.
    console.log("→ Creating GIST index on listings.location...");
    await sql`
      CREATE INDEX IF NOT EXISTS idx_listings_location
        ON listings USING GIST(location);
    `;
    console.log("✔ Created GIST index on listings.location");

    // ── SCRUM-195: H3 spatial index (BLAB-MAP-H3-01) ──────────────────────────
    // H3 (Uber's Hexagonal Hierarchical Spatial Index) divides the entire Earth
    // into a uniform hexagonal grid at 16 resolution levels.
    //
    // Why H3 on top of the GIST index?
    //   GIST answers "which rows are inside this rectangle?" (fast lookup).
    //   H3 answers "how many listings per hexagon cell?" (fast aggregation).
    //
    //   At billion scale, returning individual rows for a city-wide viewport
    //   would send megabytes of JSON. Instead, the viewport API will GROUP BY
    //   h3_index at low zoom levels, returning ~20-200 hex cells with counts —
    //   regardless of whether there are 563 or 50,000,000 listings underneath.
    //
    // Resolution guide (at Hyderabad's latitude):
    //   Res 7 → ~86 km²  (major area: Gachibowli, Banjara Hills)   — mid-zoom
    //   Res 9 → ~1.7 km² (street block: a few roads)               — fine-zoom + dispatch
    //
    // h3_postgis bridges H3 with PostGIS geometry types so we can feed
    // ST_MakePoint() directly into h3_lat_lng_to_cell().

    console.log("→ Enabling H3 extension...");
    await sql`CREATE EXTENSION IF NOT EXISTS h3;`;
    console.log("✔ H3 extension enabled (v4.1.3)");

    // ── listings: h3_index_res7 and h3_index_res9 ────────────────────────────
    // Both are GENERATED ALWAYS AS STORED — Postgres auto-computes on every
    // INSERT/UPDATE of latitude or longitude. No application code changes needed.
    // latitude/longitude on listings are NOT NULL, so no null guard required.
    // Note: h3_lat_lng_to_cell takes point(lat, lng) — latitude first, then longitude.
    // This is H3's native coordinate convention (opposite of PostGIS).
    console.log("→ Adding H3 index columns to listings...");
    await sql`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS h3_index_res7 h3index
        GENERATED ALWAYS AS (
          h3_lat_lng_to_cell(point(latitude, longitude), 7)
        ) STORED;
    `;
    await sql`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS h3_index_res9 h3index
        GENERATED ALWAYS AS (
          h3_lat_lng_to_cell(point(latitude, longitude), 9)
        ) STORED;
    `;
    console.log("✔ Added h3_index_res7 + h3_index_res9 to listings");

    // B-tree indexes on H3 columns — required for efficient GROUP BY aggregation.
    // (GIST is for geography types; B-tree is correct for h3index integer keys.)
    console.log("→ Creating B-tree indexes on listings H3 columns...");
    await sql`CREATE INDEX IF NOT EXISTS idx_listings_h3_res7 ON listings (h3_index_res7);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_listings_h3_res9 ON listings (h3_index_res9);`;
    console.log("✔ Created idx_listings_h3_res7 and idx_listings_h3_res9");

    // ── users: latitude, longitude, location, h3_index_res9 ──────────────────
    // Realtors and photographers need location-aware features:
    //   - ST_DWithin  → nearest-realtor matching (SCRUM-194)
    //   - h3_grid_disk → photographer dispatch ring expansion (SCRUM-199)
    //
    // lat/lng are nullable (not all users are realtors/photographers).
    // CASE WHEN guard ensures generated columns return NULL when location
    // is not set, rather than passing NULL into geometry functions.
    console.log("→ Adding location columns to users table...");
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude  double precision;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude double precision;`;
    await sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS location geography(POINT, 4326)
        GENERATED ALWAYS AS (
          CASE
            WHEN latitude IS NOT NULL AND longitude IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
            ELSE NULL
          END
        ) STORED;
    `;
    await sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS h3_index_res9 h3index
        GENERATED ALWAYS AS (
          CASE
            WHEN latitude IS NOT NULL AND longitude IS NOT NULL
            THEN h3_lat_lng_to_cell(point(latitude, longitude), 9)
            ELSE NULL
          END
        ) STORED;
    `;
    console.log("✔ Added latitude, longitude, location, h3_index_res9 to users");

    // GIST index on users.location → fast ST_DWithin for realtor nearest-match.
    // B-tree index on h3_index_res9 → fast h3_grid_disk ring expansion for dispatch.
    console.log("→ Creating spatial indexes on users table...");
    await sql`CREATE INDEX IF NOT EXISTS idx_users_location ON users USING GIST(location);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_h3_res9  ON users (h3_index_res9);`;
    console.log("✔ Created idx_users_location (GIST) and idx_users_h3_res9 (B-tree)");

    console.log("Migration completed successfully!");


  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

run();
