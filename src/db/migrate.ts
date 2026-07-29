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

    // ── COORDINATE ORDER FIX + DISTINCT ON INDEXES ────────────────────────────
    // BUG: h3_lat_lng_to_cell(point(latitude, longitude), r) was wrong.
    // h3_pg follows PostGIS convention: point(x, y) → x=longitude, y=latitude.
    // So point(latitude, longitude) computed cells for a swapped coordinate pair
    // (effectively treating Hyderabad at ~17°N,78°E as a location at ~78°N,17°E —
    // somewhere in the Arctic Ocean). Verified via: h3-js latLngToCell(lng,lat,7)
    // matched DB cell, confirming the swap.
    // Fix: use point(longitude, latitude) so point.x=lng, point.y=lat (correct).
    //
    // Also adds composite partial indexes for DISTINCT ON representative-pin queries
    // and a boost_score column for future premium listing monetisation.

    console.log("→ Fixing H3 coordinate order (lat/lng were swapped in point())...");

    // Must drop indexes before dropping the columns they depend on
    await sql`DROP INDEX IF EXISTS idx_listings_h3_res7;`;
    await sql`DROP INDEX IF EXISTS idx_listings_h3_res9;`;
    await sql`DROP INDEX IF EXISTS idx_listings_h3_res7_rank;`;
    await sql`DROP INDEX IF EXISTS idx_listings_h3_res9_rank;`;

    // Drop the incorrectly-computed generated columns
    await sql`ALTER TABLE listings DROP COLUMN IF EXISTS h3_index_res7;`;
    await sql`ALTER TABLE listings DROP COLUMN IF EXISTS h3_index_res9;`;

    // Re-add with corrected convention: point(longitude, latitude) → x=lng, y=lat
    await sql`
      ALTER TABLE listings
        ADD COLUMN h3_index_res7 h3index
        GENERATED ALWAYS AS (
          h3_lat_lng_to_cell(point(longitude, latitude), 7)
        ) STORED;
    `;
    await sql`
      ALTER TABLE listings
        ADD COLUMN h3_index_res9 h3index
        GENERATED ALWAYS AS (
          h3_lat_lng_to_cell(point(longitude, latitude), 9)
        ) STORED;
    `;
    console.log("✔ Fixed h3_index_res7 + h3_index_res9 coordinate order");

    // Composite partial indexes for DISTINCT ON (newest active listing per cell).
    // The (h3_index, created_at DESC) ordering lets Postgres do a pure index scan:
    // it reads the first row per cell group without sorting the full result set.
    // WHERE status='active' shrinks the index to ~10-20% of total rows.
    await sql`
      CREATE INDEX IF NOT EXISTS idx_listings_h3_res7_rank
        ON listings (h3_index_res7, created_at DESC)
        WHERE status = 'active';
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_listings_h3_res9_rank
        ON listings (h3_index_res9, created_at DESC)
        WHERE status = 'active';
    `;
    // Simple B-tree indexes kept for any remaining GROUP BY uses
    await sql`CREATE INDEX IF NOT EXISTS idx_listings_h3_res7 ON listings (h3_index_res7);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_listings_h3_res9 ON listings (h3_index_res9);`;
    console.log("✔ Created H3 composite partial indexes for DISTINCT ON representative pins");

    // boost_score: future hook for premium listing monetisation.
    // When activated: ORDER BY h3_index_res7, boost_score DESC, created_at DESC
    await sql`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS boost_score smallint NOT NULL DEFAULT 0;
    `;
    console.log("✔ Added boost_score column to listings");

    // ── MULTI-RESOLUTION H3 (res5, res6, res8) ─────────────────────────────
    // Adds intermediate resolutions for consistent ~50-100 pin density at every
    // zoom level. Without these, using res7 for all of zoom 8-12 causes visual
    // compression at low zoom (5km² cells are too small relative to the viewport).
    //
    // Resolution ladder:
    //   zoom 8-9  → res5 (~252 km²) → ~30-90 cells visible
    //   zoom 10-11 → res6 (~36 km²) → ~60-130 cells visible
    //   zoom 12   → res7 (~5 km²)   → ~50 cells  [existing column]
    //   zoom 13   → res8 (~0.74 km²) → ~110 cells
    //   zoom ≥14  → raw listings
    //
    // Space cost: ~48 bytes/listing/resolution (column + composite index).
    // 3 new columns → ~144 bytes/listing. At 1M listings: ~144 MB (negligible).
    //
    // Generated columns: Postgres auto-computes on every INSERT/UPDATE of
    // latitude/longitude. No application code changes needed.

    console.log("→ Adding H3 multi-resolution columns (res5, res6, res8) to listings...");
    await sql`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS h3_index_res5 h3index
        GENERATED ALWAYS AS (
          h3_lat_lng_to_cell(point(longitude, latitude), 5)
        ) STORED;
    `;
    await sql`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS h3_index_res6 h3index
        GENERATED ALWAYS AS (
          h3_lat_lng_to_cell(point(longitude, latitude), 6)
        ) STORED;
    `;
    await sql`
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS h3_index_res8 h3index
        GENERATED ALWAYS AS (
          h3_lat_lng_to_cell(point(longitude, latitude), 8)
        ) STORED;
    `;
    console.log("✔ Added h3_index_res5, res6, res8 to listings");

    // Composite partial indexes for DISTINCT ON representative-pin queries.
    // Order: (cell, boost_score DESC, created_at DESC) — boost_score first so
    // premium listings (boost_score > 0) win their cell when monetisation is active.
    // WHERE status='active' shrinks the index to active listings only.
    await sql`
      CREATE INDEX IF NOT EXISTS idx_listings_h3_res5_rank
        ON listings (h3_index_res5, boost_score DESC, created_at DESC)
        WHERE status = 'active';
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_listings_h3_res6_rank
        ON listings (h3_index_res6, boost_score DESC, created_at DESC)
        WHERE status = 'active';
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_listings_h3_res8_rank
        ON listings (h3_index_res8, boost_score DESC, created_at DESC)
        WHERE status = 'active';
    `;
    console.log("✔ Created composite partial indexes (res5_rank, res6_rank, res8_rank)");

    // Fix users table — same coordinate order bug
    await sql`DROP INDEX IF EXISTS idx_users_h3_res9;`;
    await sql`ALTER TABLE users DROP COLUMN IF EXISTS h3_index_res9;`;
    await sql`
      ALTER TABLE users
        ADD COLUMN h3_index_res9 h3index
        GENERATED ALWAYS AS (
          CASE
            WHEN latitude IS NOT NULL AND longitude IS NOT NULL
            THEN h3_lat_lng_to_cell(point(longitude, latitude), 9)
            ELSE NULL
          END
        ) STORED;
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_h3_res9 ON users (h3_index_res9);`;
    console.log("✔ Fixed users.h3_index_res9 coordinate order");

    // ── Rename 'broker' → 'realtor' in user_role enum ──────────────────────
    // PostgreSQL 10+ supports renaming enum values directly without recreating
    // the type. This is safe on live data — existing rows are updated in place.
    await sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'broker'
            AND enumtypid = 'user_role'::regtype
        ) THEN
          ALTER TYPE user_role RENAME VALUE 'broker' TO 'realtor';
        END IF;
      END
      $$;
    `;
    console.log("✔ Renamed user_role enum value 'broker' → 'realtor'");

    // Also update lister_type text column on listings (free-text, not enum)
    await sql`UPDATE listings SET lister_type = 'realtor' WHERE lister_type = 'broker';`;
    console.log("✔ Updated listings.lister_type 'broker' → 'realtor'");


    // ══════════════════════════════════════════════════════════════════════════
    // Realtor Platform — schema additions
    // All blocks are idempotent (IF NOT EXISTS / DO $$ ... END $$).
    // ══════════════════════════════════════════════════════════════════════════

    // ── subscription_tier enum ───────────────────────────────────────────────
    await sql`
      DO $$ BEGIN
        CREATE TYPE subscription_tier AS ENUM (
          'free_trial', 'soft_cap', 'pro', 'pro_plus'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `;
    console.log("✔ subscription_tier enum ready");

    // ── New columns on users ─────────────────────────────────────────────────
    // Realtor profile
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url             text;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio                   text;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS years_experience      smallint;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS languages_spoken      jsonb;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS areas_served          jsonb;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS realtor_latitude      double precision;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS realtor_longitude     double precision;`;

    // Subscription / trial
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier           subscription_tier DEFAULT 'free_trial';`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at            timestamptz;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_sale_leads_used       smallint DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_rental_leads_used     smallint DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS soft_cap_sale_leads_month   smallint DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS soft_cap_rental_leads_month smallint DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS soft_cap_month              varchar(7);`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS soft_cap_overflow_leads     smallint DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_lead_assigned_at       timestamptz;`;

    // Ranking score components
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS realtor_score        integer DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS score_tier_base      integer DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS score_response_rate  smallint DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS score_response_speed smallint DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS score_listing_activity smallint DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS score_reviews        smallint DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS score_profile        smallint DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS score_tenure         smallint DEFAULT 0;`;

    // Capacity (pre-computed, event-driven — never a subquery at routing time)
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_listing_count  smallint DEFAULT 0;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS max_listing_capacity  smallint DEFAULT 2;`;

    console.log("✔ Added realtor columns to users table");

    // ── base_location — PostGIS generated geography from realtor_lat/lng ─────
    await sql`
      DO $$ BEGIN
        ALTER TABLE users
          ADD COLUMN base_location geography(POINT, 4326)
          GENERATED ALWAYS AS (
            CASE
              WHEN realtor_latitude IS NOT NULL AND realtor_longitude IS NOT NULL
              THEN ST_SetSRID(ST_MakePoint(realtor_longitude, realtor_latitude), 4326)::geography
              ELSE NULL
            END
          ) STORED;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `;
    console.log("✔ base_location generated geography column ready");

    // ── Realtor-specific indexes ─────────────────────────────────────────────
    await sql`
      CREATE INDEX IF NOT EXISTS idx_users_realtor_score
        ON users (realtor_score DESC)
        WHERE role = 'realtor' AND subscription_tier != 'soft_cap';
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_users_realtor_location
        ON users USING GIST (base_location)
        WHERE role = 'realtor' AND base_location IS NOT NULL;
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_users_realtor_capacity
        ON users (active_listing_count, max_listing_capacity)
        WHERE role = 'realtor';
    `;
    // Partial B-tree for assigned realtor lookups on active listings — O(log N)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_listings_assigned_realtor
        ON listings (assigned_realtor_id)
        WHERE status = 'active';
    `;
    console.log("✔ Realtor indexes ready");

    // ── Backfill existing realtor rows ───────────────────────────────────────
    await sql`
      UPDATE users
      SET
        subscription_tier    = 'free_trial',
        trial_started_at     = NOW(),
        score_tier_base      = 1000,
        realtor_score        = 1000,
        max_listing_capacity = 2
      WHERE role = 'realtor'
        AND subscription_tier IS NULL;
    `;
    console.log("✔ Backfilled existing realtors to free_trial");

    // ── leads table ──────────────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS leads (
        id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        realtor_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        listing_id       uuid REFERENCES listings(id) ON DELETE SET NULL,
        requester_id     uuid REFERENCES users(id) ON DELETE SET NULL,
        requester_phone  text,
        requester_name   text,
        type             text NOT NULL CHECK (type IN ('buyer_enquiry', 'seller_listing_request')),
        created_at       timestamptz DEFAULT NOW() NOT NULL,
        responded_at     timestamptz,
        response_channel text CHECK (response_channel IN ('whatsapp', 'call', 'in_app')),
        closed_at        timestamptz,
        outcome          text CHECK (outcome IN ('converted', 'lost', 'no_response', 'duplicate')),
        notes            text
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_leads_realtor_created ON leads (realtor_id, created_at DESC);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_leads_listing ON leads (listing_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_leads_unresponded ON leads (realtor_id, created_at) WHERE responded_at IS NULL;`;
    console.log("✔ leads table ready");

    // ── viewings table ───────────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS viewings (
        id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        listing_id           uuid REFERENCES listings(id) ON DELETE SET NULL,
        realtor_id           uuid REFERENCES users(id) ON DELETE CASCADE,
        buyer_id             uuid REFERENCES users(id) ON DELETE SET NULL,
        scheduled_at         timestamptz NOT NULL,
        duration_mins        integer DEFAULT 30,
        status               text DEFAULT 'pending' NOT NULL
                             CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
        cancellation_reason  text,
        notes                text,
        created_at           timestamptz DEFAULT NOW() NOT NULL,
        updated_at           timestamptz DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_viewings_realtor_scheduled ON viewings (realtor_id, scheduled_at) WHERE status NOT IN ('cancelled', 'completed');`;
    await sql`CREATE INDEX IF NOT EXISTS idx_viewings_listing ON viewings (listing_id);`;
    console.log("✔ viewings table ready");

    // ── realtor_closings table ───────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS realtor_closings (
        id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        realtor_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        listing_id     uuid REFERENCES listings(id) ON DELETE SET NULL,
        lead_id        uuid REFERENCES leads(id) ON DELETE SET NULL,
        closed_at      timestamptz DEFAULT NOW() NOT NULL,
        sale_price     integer,
        commission_pct numeric(5, 2),
        notes          text
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_closings_realtor ON realtor_closings (realtor_id, closed_at DESC);`;
    console.log("✔ realtor_closings table ready");

    // ── realtor_reviews table ────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS realtor_reviews (
        id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        realtor_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reviewer_id   uuid REFERENCES users(id) ON DELETE SET NULL,
        listing_id    uuid REFERENCES listings(id) ON DELETE SET NULL,
        rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
        review_text   text,
        reviewer_role text CHECK (reviewer_role IN ('buyer', 'seller')),
        created_at    timestamptz DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_reviews_realtor ON realtor_reviews (realtor_id, created_at DESC);`;
    console.log("✔ realtor_reviews table ready");

    // ── total_deals column (realtor credibility metric, set at signup + auto-incr on closings) ──
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_deals INTEGER DEFAULT 0;`;
    console.log("✔ total_deals column ready");

    // ════════════════════════════════════════════════════════════════════════
    console.log("Migration completed successfully!");




  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

run();
