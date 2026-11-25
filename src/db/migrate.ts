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

    // ══════════════════════════════════════════════════════════════════════════
    // Shutterbug Scheduling System — MVP1
    // All blocks are idempotent (IF NOT EXISTS / DO $$ ... END $$).
    // ══════════════════════════════════════════════════════════════════════════

    // ── Add 'shutterbug' to user_role enum ───────────────────────────────────
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'shutterbug'
            AND enumtypid = 'user_role'::regtype
        ) THEN
          ALTER TYPE user_role ADD VALUE 'shutterbug';
        END IF;
      END
      $$;
    `;
    console.log("✔ 'shutterbug' added to user_role enum");

    // ── Shutterbug columns on users ──────────────────────────────────────────
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token           text;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_dispatched_at   timestamptz;`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS operating_h3_cell    text;`;
    console.log("✔ Shutterbug columns added to users");

    // Partial index for round-robin: active shutterbugs ordered by last dispatch time
    await sql`
      CREATE INDEX IF NOT EXISTS idx_users_shutterbug_dispatch
        ON users (last_dispatched_at ASC NULLS FIRST)
        WHERE role = 'shutterbug' AND push_token IS NOT NULL;
    `;
    console.log("✔ Shutterbug dispatch index ready");

    // ── service_config table ─────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS service_config (
        id                  varchar(20) PRIMARY KEY DEFAULT 'default',
        zone_center_lat     double precision NOT NULL DEFAULT 17.3496,
        zone_center_lng     double precision NOT NULL DEFAULT 78.5521,
        zone_radius_km      double precision NOT NULL DEFAULT 5,
        time_windows        jsonb NOT NULL DEFAULT '[
          {"id":"A","label":"Morning","startHour":9,"startMin":0,"endHour":11,"endMin":0},
          {"id":"B","label":"Late Morning","startHour":11,"startMin":30,"endHour":13,"endMin":30},
          {"id":"C","label":"Afternoon","startHour":14,"startMin":30,"endHour":16,"endMin":30},
          {"id":"D","label":"Evening","startHour":17,"startMin":0,"endHour":19,"endMin":0}
        ]'::jsonb,
        min_lead_time_hours  integer NOT NULL DEFAULT 3,
        booking_window_days  integer NOT NULL DEFAULT 10,
        updated_at           timestamptz DEFAULT NOW() NOT NULL
      );
    `;
    // Seed the single config row if it doesn't exist
    await sql`
      INSERT INTO service_config (id) VALUES ('default')
      ON CONFLICT (id) DO NOTHING;
    `;
    console.log("✔ service_config table ready with default L.B. Nagar zone");

    // ── photography_bookings table ───────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS photography_bookings (
        id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        listing_id              uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        customer_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_date               varchar(10) NOT NULL,
        slot_window             varchar(1) NOT NULL CHECK (slot_window IN ('A','B','C','D')),
        status                  varchar(20) NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','confirmed','en_route','completed','cancelled','no_show')),
        assigned_shutterbug_id  uuid REFERENCES users(id) ON DELETE SET NULL,
        customer_notes          text,
        property_h3_cell        text,
        booking_source          varchar(20) DEFAULT 'organic',
        created_at              timestamptz DEFAULT NOW() NOT NULL,
        updated_at              timestamptz DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_photo_bookings_slot       ON photography_bookings (slot_date, slot_window) WHERE status != 'cancelled';`;
    await sql`CREATE INDEX IF NOT EXISTS idx_photo_bookings_listing    ON photography_bookings (listing_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_photo_bookings_shutterbug ON photography_bookings (assigned_shutterbug_id, slot_date) WHERE status NOT IN ('cancelled','completed');`;
    await sql`CREATE INDEX IF NOT EXISTS idx_photo_bookings_customer   ON photography_bookings (customer_id, created_at DESC);`;
    console.log("✔ photography_bookings table ready");

    // ── photography_waitlist table ───────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS photography_waitlist (
        id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        listing_id            uuid REFERENCES listings(id) ON DELETE SET NULL,
        customer_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        property_address      text,
        property_lat          double precision,
        property_lng          double precision,
        property_h3_cell      text,
        queue_position        integer,
        status                varchar(20) NOT NULL DEFAULT 'waiting'
                              CHECK (status IN ('waiting','notified','booked','expired')),
        notified_at           timestamptz,
        converted_booking_id  uuid,
        created_at            timestamptz DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_waitlist_h3       ON photography_waitlist (property_h3_cell, status);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_waitlist_customer ON photography_waitlist (customer_id);`;
    console.log("✔ photography_waitlist table ready");

    // ════════════════════════════════════════════════════════════════════════
    // ── Migration: add 'user' to user_role enum (unified regular-user role) ──────
    // buyer/owner/developer roles are kept for backwards compat with existing rows.
    // New signups default to 'user' — can browse AND list without role friction.
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'user'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
        ) THEN
          ALTER TYPE user_role ADD VALUE 'user';
        END IF;
      END$$;
    `;
    console.log("✓ Added 'user' value to user_role enum");

    // Migrate buyer + owner → 'user'.  Developer stays as 'developer' —
    // it is a separate B2B product segment (project listings, not individual units).
    await sql`
      UPDATE users
      SET role = 'user'
      WHERE role IN ('buyer', 'owner')
    `;
    console.log("✓ Migrated buyer/owner → 'user' role (developer unchanged)");

    // ════════════════════════════════════════════════════════════════════════
    // Shutterbug Dispatch, Route Allocation & Live Tracking Engine — MVP2
    // ════════════════════════════════════════════════════════════════════════

    await sql`CREATE EXTENSION IF NOT EXISTS btree_gist;`;
    console.log("✔ btree_gist extension enabled");

    // Update service_config to cover Full Hyderabad + ORR + 25 km belt (65 km radius)
    // and use the 3 Daylight Windows (9–12, 12–3, 3–5:30).
    await sql`
      UPDATE service_config
      SET zone_center_lat = 17.3850,
          zone_center_lng = 78.4867,
          zone_radius_km = 65,
          min_lead_time_hours = 2,
          time_windows = '[
            {"id":"A","label":"Morning","startHour":9,"startMin":0,"endHour":12,"endMin":0},
            {"id":"B","label":"Midday","startHour":12,"startMin":0,"endHour":15,"endMin":0},
            {"id":"C","label":"Afternoon","startHour":15,"startMin":0,"endHour":17,"endMin":30}
          ]'::jsonb,
          updated_at = NOW()
      WHERE id = 'default';
    `;
    console.log("✔ service_config updated to 65 km Greater Hyderabad + ORR + 25km radius & 3 Daylight Windows");

    // 1. shutterbug_profiles table
    await sql`
      CREATE TABLE IF NOT EXISTS shutterbug_profiles (
        user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        display_name      text NOT NULL DEFAULT 'Blab Shutterbug',
        enabled           boolean NOT NULL DEFAULT true,
        dispatch_enabled  boolean NOT NULL DEFAULT true,
        capabilities      text[] NOT NULL DEFAULT ARRAY['photos']::text[],
        reliability_score numeric(5,2) NOT NULL DEFAULT 100.00 CHECK (reliability_score BETWEEN 0 AND 100),
        home_lat          double precision NOT NULL DEFAULT 17.3850,
        home_lng          double precision NOT NULL DEFAULT 78.4867,
        updated_at        timestamptz NOT NULL DEFAULT now()
      );
    `;
    console.log("✔ shutterbug_profiles table ready");

    // 2. shutterbug_shifts table
    await sql`
      CREATE TABLE IF NOT EXISTS shutterbug_shifts (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shutterbug_id   uuid NOT NULL REFERENCES shutterbug_profiles(user_id) ON DELETE CASCADE,
        zone_code       text NOT NULL DEFAULT 'HYD_METRO',
        shift_date      varchar(10) NOT NULL,
        starts_at       timestamptz NOT NULL,
        ends_at         timestamptz NOT NULL,
        start_point     geography(Point, 4326) NOT NULL,
        end_point       geography(Point, 4326) NOT NULL,
        status          text NOT NULL DEFAULT 'committed' CHECK (status IN ('committed', 'cancelled')),
        route_version   integer NOT NULL DEFAULT 0,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CHECK (ends_at > starts_at),
        EXCLUDE USING gist (
          shutterbug_id WITH =,
          tstzrange(starts_at, ends_at, '[)') WITH &&
        ) WHERE (status = 'committed')
      );
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_shutterbug_shift_day ON shutterbug_shifts (shutterbug_id, shift_date) WHERE status = 'committed';`;
    console.log("✔ shutterbug_shifts table ready");

    // 3. Upgrade photography_bookings constraints & columns
    await sql`
      DO $$
      DECLARE
        r record;
      BEGIN
        FOR r IN (
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'photography_bookings'::regclass
            AND contype = 'c'
            AND (pg_get_constraintdef(oid) ILIKE '%slot_window%' OR pg_get_constraintdef(oid) ILIKE '%status%')
        ) LOOP
          EXECUTE 'ALTER TABLE photography_bookings DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
        END LOOP;
      END $$;
    `;

    await sql`
      ALTER TABLE photography_bookings
        ADD COLUMN IF NOT EXISTS booker_id              uuid REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS booker_role            text NOT NULL DEFAULT 'owner',
        ADD COLUMN IF NOT EXISTS service_mode           text NOT NULL DEFAULT 'scheduled',
        ADD COLUMN IF NOT EXISTS lifecycle_state        text NOT NULL DEFAULT 'booked',
        ADD COLUMN IF NOT EXISTS delivery_state         text NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS property_point         geography(Point, 4326),
        ADD COLUMN IF NOT EXISTS access_point           geography(Point, 4326),
        ADD COLUMN IF NOT EXISTS arrival_window_start   timestamptz,
        ADD COLUMN IF NOT EXISTS arrival_window_end     timestamptz,
        ADD COLUMN IF NOT EXISTS planned_start_at       timestamptz,
        ADD COLUMN IF NOT EXISTS forecast_arrival_at    timestamptz,
        ADD COLUMN IF NOT EXISTS daylight_cutoff_at     timestamptz,
        ADD COLUMN IF NOT EXISTS onsite_minutes         integer NOT NULL DEFAULT 50,
        ADD COLUMN IF NOT EXISTS exterior_minutes       integer NOT NULL DEFAULT 20,
        ADD COLUMN IF NOT EXISTS setup_minutes          integer NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS units_json             jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS access_mode            text NOT NULL DEFAULT 'booker_present',
        ADD COLUMN IF NOT EXISTS onsite_name            text,
        ADD COLUMN IF NOT EXISTS onsite_phone_e164      text,
        ADD COLUMN IF NOT EXISTS tracking_token_hash    text,
        ADD COLUMN IF NOT EXISTS tracking_token_expires timestamptz,
        ADD COLUMN IF NOT EXISTS arrival_otp            varchar(6),
        ADD COLUMN IF NOT EXISTS arrival_otp_hash       text,
        ADD COLUMN IF NOT EXISTS arrival_otp_attempts   integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS arrival_photo_url      text,
        ADD COLUMN IF NOT EXISTS travel_started_at      timestamptz,
        ADD COLUMN IF NOT EXISTS tracking_started_at    timestamptz,
        ADD COLUMN IF NOT EXISTS arrived_at             timestamptz,
        ADD COLUMN IF NOT EXISTS shoot_started_at       timestamptz,
        ADD COLUMN IF NOT EXISTS shoot_finished_at      timestamptz,
        ADD COLUMN IF NOT EXISTS completed_at           timestamptz,
        ADD COLUMN IF NOT EXISTS idempotency_key        text,
        ADD COLUMN IF NOT EXISTS request_hash           text,
        ADD COLUMN IF NOT EXISTS version                integer NOT NULL DEFAULT 0;
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_bookings_idempotency ON photography_bookings (idempotency_key) WHERE idempotency_key IS NOT NULL;`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_bookings_tracking_token ON photography_bookings (tracking_token_hash) WHERE tracking_token_hash IS NOT NULL;`;
    console.log("✔ photography_bookings upgraded with route, access, OTP & lifecycle columns");

    // 4. photography_allocations table
    await sql`
      CREATE TABLE IF NOT EXISTS photography_allocations (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id          uuid REFERENCES photography_bookings(id) ON DELETE CASCADE,
        shift_id            uuid NOT NULL REFERENCES shutterbug_shifts(id) ON DELETE CASCADE,
        shutterbug_id       uuid NOT NULL REFERENCES shutterbug_profiles(user_id) ON DELETE CASCADE,
        kind                text NOT NULL DEFAULT 'visit' CHECK (kind IN ('visit', 'break')),
        status              text NOT NULL CHECK (status IN ('offered', 'committed', 'released', 'expired', 'finished')),
        onsite_start        timestamptz NOT NULL,
        onsite_end          timestamptz NOT NULL,
        actual_finished_at  timestamptz,
        point               geography(Point, 4326) NOT NULL,
        h3_cell             text NOT NULL,
        expires_at          timestamptz,
        created_at          timestamptz NOT NULL DEFAULT now(),
        CHECK (onsite_end > onsite_start),
        CHECK (kind <> 'visit' OR booking_id IS NOT NULL),
        CHECK (status <> 'offered' OR expires_at IS NOT NULL),
        EXCLUDE USING gist (
          shutterbug_id WITH =,
          tstzrange(onsite_start, COALESCE(actual_finished_at, onsite_end), '[)') WITH &&
        ) WHERE (status IN ('offered', 'committed'))
      );
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_alloc_per_booking
        ON photography_allocations(booking_id)
        WHERE status IN ('offered', 'committed');
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_offer_per_worker
        ON photography_allocations(shutterbug_id)
        WHERE status = 'offered';
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_allocations_shift_start
        ON photography_allocations(shift_id, onsite_start);
    `;
    console.log("✔ photography_allocations table ready");

    // 5. photography_outbox table
    await sql`
      CREATE TABLE IF NOT EXISTS photography_outbox (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id      uuid REFERENCES photography_bookings(id) ON DELETE CASCADE,
        target_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
        event_type      text NOT NULL,
        dedupe_key      text NOT NULL UNIQUE,
        payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
        status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'suppressed', 'failed')),
        attempts        integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        locked_until    timestamptz,
        lock_owner      text,
        last_error      text,
        created_at      timestamptz NOT NULL DEFAULT now()
      );
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_outbox_due
        ON photography_outbox(next_attempt_at)
        WHERE status = 'pending';
    `;
    console.log("✔ photography_outbox table ready");

    // 6. Sequential PL/pgSQL function: reserve_photography_visit
    await sql`
      CREATE OR REPLACE FUNCTION reserve_photography_visit(
        p_booking_id             uuid,
        p_caller_user_id         uuid,
        p_idempotency_key        text,
        p_request_hash           text,
        p_shift_id               uuid,
        p_expected_route_ver     integer,
        p_expected_prev_alloc_id uuid,
        p_expected_next_alloc_id uuid,
        p_allocation_status      text,
        p_offer_ttl_seconds      integer,
        p_onsite_start           timestamptz,
        p_travel_from_prev_mins  integer,
        p_travel_to_next_mins    integer
      )
      RETURNS TABLE (
        ok                boolean,
        error_code        text,
        allocation_id     uuid,
        allocation_status text,
        new_route_ver     integer
      )
      LANGUAGE plpgsql
      AS $$
      DECLARE
        v_booking        photography_bookings%ROWTYPE;
        v_shift          shutterbug_shifts%ROWTYPE;
        v_existing_alloc photography_allocations%ROWTYPE;
        v_prev_id        uuid;
        v_prev_end       timestamptz;
        v_next_id        uuid;
        v_next_start     timestamptz;
        v_onsite_end     timestamptz;
        v_expired_count  integer := 0;
        v_expires_at     timestamptz;
        v_alloc_id       uuid;
      BEGIN
        -- 0. Basic non-null & domain guard
        IF p_booking_id IS NULL OR p_shift_id IS NULL OR p_onsite_start IS NULL
           OR p_idempotency_key IS NULL OR p_request_hash IS NULL
           OR p_travel_from_prev_mins IS NULL OR p_travel_from_prev_mins < 0
           OR p_travel_to_next_mins IS NULL OR p_travel_to_next_mins < 0
           OR p_allocation_status NOT IN ('committed', 'offered') THEN
          RETURN QUERY SELECT false, 'INVALID_ARGUMENTS'::text, NULL::uuid, NULL::text, NULL::integer;
          RETURN;
        END IF;

        -- 1. Lock the booking row FIRST to serialize all reservation attempts for this booking
        SELECT * INTO v_booking
          FROM photography_bookings
         WHERE id = p_booking_id
         FOR UPDATE;

        IF NOT FOUND THEN
          RETURN QUERY SELECT false, 'BOOKING_NOT_FOUND'::text, NULL::uuid, NULL::text, NULL::integer;
          RETURN;
        END IF;

        IF COALESCE(v_booking.booker_id, v_booking.customer_id) IS DISTINCT FROM p_caller_user_id THEN
          RETURN QUERY SELECT false, 'FORBIDDEN'::text, NULL::uuid, NULL::text, NULL::integer;
          RETURN;
        END IF;

        -- 2. Post-lock idempotency check (verifies payload hash & returns live status)
        IF v_booking.idempotency_key IS NOT NULL THEN
          IF v_booking.idempotency_key = p_idempotency_key THEN
            IF v_booking.request_hash IS DISTINCT FROM p_request_hash THEN
              RETURN QUERY SELECT false, 'IDEMPOTENCY_PAYLOAD_MISMATCH'::text, NULL::uuid, NULL::text, NULL::integer;
              RETURN;
            END IF;
            SELECT * INTO v_existing_alloc
              FROM photography_allocations
             WHERE booking_id = p_booking_id
             ORDER BY created_at DESC
             LIMIT 1;
            IF FOUND THEN
              RETURN QUERY SELECT
                v_existing_alloc.status IN ('offered', 'committed'),
                CASE WHEN v_existing_alloc.status IN ('offered', 'committed') THEN NULL ELSE 'ALLOCATION_' || upper(v_existing_alloc.status) END,
                v_existing_alloc.id,
                v_existing_alloc.status,
                NULL::integer;
              RETURN;
            END IF;
          END IF;
        END IF;

        -- Reject if booking already has an active allocation
        IF EXISTS (
          SELECT 1 FROM photography_allocations
           WHERE booking_id = p_booking_id
             AND status IN ('offered', 'committed')
        ) THEN
          RETURN QUERY SELECT false, 'BOOKING_ALREADY_ALLOCATED'::text, NULL::uuid, NULL::text, NULL::integer;
          RETURN;
        END IF;

        -- 3. Validate booking-derived window, duration, and daylight invariants
        IF v_booking.onsite_minutes IS NULL OR v_booking.onsite_minutes <= 0
           OR v_booking.arrival_window_start IS NULL OR v_booking.arrival_window_end IS NULL
           OR p_onsite_start < v_booking.arrival_window_start
           OR p_onsite_start > v_booking.arrival_window_end THEN
          RETURN QUERY SELECT false, 'OUTSIDE_PROMISED_WINDOW'::text, NULL::uuid, NULL::text, NULL::integer;
          RETURN;
        END IF;

        v_onsite_end := p_onsite_start + make_interval(mins => v_booking.onsite_minutes);

        IF COALESCE(v_booking.exterior_minutes, 0) > 0 THEN
          IF v_booking.daylight_cutoff_at IS NULL
             OR (p_onsite_start + make_interval(mins => COALESCE(v_booking.setup_minutes, 0) + v_booking.exterior_minutes) > v_booking.daylight_cutoff_at) THEN
            RETURN QUERY SELECT false, 'PAST_DAYLIGHT_CUTOFF'::text, NULL::uuid, NULL::text, NULL::integer;
            RETURN;
          END IF;
        END IF;

        -- 4. Lock the candidate shift row
        SELECT * INTO v_shift
          FROM shutterbug_shifts
         WHERE id = p_shift_id
           AND status = 'committed'
         FOR UPDATE;

        IF NOT FOUND THEN
          RETURN QUERY SELECT false, 'SHIFT_NOT_FOUND'::text, NULL::uuid, NULL::text, NULL::integer;
          RETURN;
        END IF;

        -- 5. Expire stale offers on this shift; if any row expired, bump route_version immediately
        WITH expired AS (
          UPDATE photography_allocations
             SET status = 'expired'
           WHERE shift_id = p_shift_id
             AND status = 'offered'
             AND expires_at <= clock_timestamp()
          RETURNING id
        )
        SELECT COUNT(*)::integer INTO v_expired_count FROM expired;

        IF v_expired_count > 0 THEN
          UPDATE shutterbug_shifts
             SET route_version = route_version + 1
           WHERE id = p_shift_id
           RETURNING route_version INTO v_shift.route_version;
        END IF;

        -- 6. Verify route_version matches what Mapbox computed against
        IF v_shift.route_version IS DISTINCT FROM p_expected_route_ver THEN
          RETURN QUERY SELECT false, 'ROUTE_VERSION_MISMATCH'::text, NULL::uuid, NULL::text, v_shift.route_version;
          RETURN;
        END IF;

        -- 7. Check shift start/end bounds including travel to/from shift anchors
        IF p_onsite_start - make_interval(mins => p_travel_from_prev_mins) < v_shift.starts_at
           OR v_onsite_end + make_interval(mins => p_travel_to_next_mins) > v_shift.ends_at THEN
          RETURN QUERY SELECT false, 'OUTSIDE_SHIFT_BOUNDS'::text, NULL::uuid, NULL::text, v_shift.route_version;
          RETURN;
        END IF;

        -- 8. Check direct interval overlap using actual_finished_at for completed visits
        IF EXISTS (
          SELECT 1 FROM photography_allocations
           WHERE shift_id = p_shift_id
             AND status IN ('offered', 'committed', 'finished')
             AND tstzrange(onsite_start, COALESCE(actual_finished_at, onsite_end), '[)')
                 && tstzrange(p_onsite_start, v_onsite_end, '[)')
        ) THEN
          RETURN QUERY SELECT false, 'INTERVAL_CONFLICT'::text, NULL::uuid, NULL::text, v_shift.route_version;
          RETURN;
        END IF;

        -- 9. Verify exact preceding neighbor ID & travel inequality
        SELECT id, COALESCE(actual_finished_at, onsite_end)
          INTO v_prev_id, v_prev_end
          FROM photography_allocations
         WHERE shift_id = p_shift_id
           AND status IN ('offered', 'committed', 'finished')
           AND COALESCE(actual_finished_at, onsite_end) <= p_onsite_start
         ORDER BY COALESCE(actual_finished_at, onsite_end) DESC
         LIMIT 1;

        IF v_prev_id IS DISTINCT FROM p_expected_prev_alloc_id THEN
          RETURN QUERY SELECT false, 'NEIGHBOR_CHANGED'::text, NULL::uuid, NULL::text, v_shift.route_version;
          RETURN;
        END IF;

        IF v_prev_end IS NOT NULL
           AND (v_prev_end + make_interval(mins => p_travel_from_prev_mins) > p_onsite_start) THEN
          RETURN QUERY SELECT false, 'PREV_TRAVEL_INFEASIBLE'::text, NULL::uuid, NULL::text, v_shift.route_version;
          RETURN;
        END IF;

        -- 10. Verify exact following neighbor ID & travel inequality
        SELECT id, onsite_start
          INTO v_next_id, v_next_start
          FROM photography_allocations
         WHERE shift_id = p_shift_id
           AND status IN ('offered', 'committed')
           AND onsite_start >= v_onsite_end
         ORDER BY onsite_start ASC
         LIMIT 1;

        IF v_next_id IS DISTINCT FROM p_expected_next_alloc_id THEN
          RETURN QUERY SELECT false, 'NEIGHBOR_CHANGED'::text, NULL::uuid, NULL::text, v_shift.route_version;
          RETURN;
        END IF;

        IF v_next_start IS NOT NULL
           AND (v_onsite_end + make_interval(mins => p_travel_to_next_mins) > v_next_start) THEN
          RETURN QUERY SELECT false, 'NEXT_TRAVEL_INFEASIBLE'::text, NULL::uuid, NULL::text, v_shift.route_version;
          RETURN;
        END IF;

        -- 11. Insert allocation, update booking & shift route_version, and enqueue outbox event
        v_expires_at := CASE
          WHEN p_allocation_status = 'offered' THEN clock_timestamp() + make_interval(secs => COALESCE(p_offer_ttl_seconds, 35))
          ELSE NULL
        END;

        INSERT INTO photography_allocations (
          booking_id, shift_id, shutterbug_id, kind, status,
          onsite_start, onsite_end, point, h3_cell, expires_at
        ) VALUES (
          p_booking_id, p_shift_id, v_shift.shutterbug_id, 'visit', p_allocation_status,
          p_onsite_start, v_onsite_end, v_booking.property_point, COALESCE(v_booking.property_h3_cell, ''), v_expires_at
        ) RETURNING id INTO v_alloc_id;

        UPDATE photography_bookings
           SET assigned_shutterbug_id = v_shift.shutterbug_id,
               planned_start_at       = p_onsite_start,
               forecast_arrival_at    = p_onsite_start,
               status                 = CASE WHEN p_allocation_status = 'committed' THEN 'confirmed' ELSE 'pending' END,
               lifecycle_state        = CASE WHEN p_allocation_status = 'committed' THEN 'assigned' ELSE 'booked' END,
               idempotency_key        = p_idempotency_key,
               request_hash           = p_request_hash,
               version                = version + 1,
               updated_at             = clock_timestamp()
         WHERE id = p_booking_id;

        UPDATE shutterbug_shifts
           SET route_version = route_version + 1
         WHERE id = p_shift_id
         RETURNING route_version INTO new_route_ver;

        INSERT INTO photography_outbox (booking_id, target_user_id, event_type, dedupe_key, payload)
        VALUES (
          p_booking_id,
          v_shift.shutterbug_id,
          CASE WHEN p_allocation_status = 'offered' THEN 'EXPRESS_OFFER_CREATED' ELSE 'SCHEDULED_VISIT_ASSIGNED' END,
          'alloc:' || v_alloc_id::text,
          jsonb_build_object(
            'allocationId', v_alloc_id,
            'bookingId', p_booking_id,
            'onsiteStart', p_onsite_start,
            'expiresAt', v_expires_at
          )
        ) ON CONFLICT (dedupe_key) DO NOTHING;

        RETURN QUERY SELECT true, NULL::text, v_alloc_id, p_allocation_status, new_route_ver;
      END;
      $$;
    `;
    console.log("✔ reserve_photography_visit PL/pgSQL function installed");

    // 7. Seed shutterbug_profiles & 14 days of shifts for all active shutterbugs
    await sql`
      INSERT INTO shutterbug_profiles (user_id, display_name, home_lat, home_lng)
      SELECT id, 'Rahul K. (Shutterbug)', 17.3496, 78.5521
      FROM users
      WHERE role = 'shutterbug'
      ON CONFLICT (user_id) DO NOTHING;
    `;
    console.log("✔ Seeded shutterbug_profiles for existing shutterbugs");

    // ══════════════════════════════════════════════════════════════════════════
    // MVP Phases 1–4: Multi-Category Specs, Society/Builder Units, Promo & Orders
    // ══════════════════════════════════════════════════════════════════════════

    await sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;`;
    await sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS property_specs jsonb DEFAULT '{}'::jsonb;`;
    await sql`CREATE INDEX IF NOT EXISTS idx_listings_society_name ON listings (society_name) WHERE society_name IS NOT NULL;`;
    console.log("✔ listings.photos & listings.property_specs ready");

    await sql`ALTER TABLE service_config ADD COLUMN IF NOT EXISTS launch_promo_active boolean NOT NULL DEFAULT true;`;
    await sql`ALTER TABLE service_config ADD COLUMN IF NOT EXISTS launch_promo_label text NOT NULL DEFAULT 'Launch Offer · 100% Free';`;
    await sql`ALTER TABLE service_config ADD COLUMN IF NOT EXISTS shoot_base_price_inr integer NOT NULL DEFAULT 999;`;
    await sql`ALTER TABLE service_config ADD COLUMN IF NOT EXISTS express_surcharge_inr integer NOT NULL DEFAULT 500;`;
    console.log("✔ service_config pricing & launch promo columns ready");

    await sql`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        listing_id       uuid REFERENCES listings(id) ON DELETE SET NULL,
        booking_id       uuid REFERENCES photography_bookings(id) ON DELETE SET NULL,
        order_type       text NOT NULL CHECK (order_type IN ('photography_shoot', 'realtor_pro', 'realtor_pro_plus')),
        base_amount_inr  integer NOT NULL,
        discount_inr     integer NOT NULL DEFAULT 0,
        payable_inr      integer NOT NULL DEFAULT 0,
        promo_code       text,
        status           text NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'refunded')),
        created_at       timestamptz NOT NULL DEFAULT NOW()
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders (user_id, created_at DESC);`;
    console.log("✔ payment_orders table ready");

    // Seed diverse Hyderabad Commercial, Industrial, Agricultural & Multi-Unit Society listings
    const [ownerRow] = await sql`SELECT id FROM users LIMIT 1`;
    if (ownerRow?.id) {
      const seedMarker = "BLAB_MVP_SEED_V1";
      const existingSeed = await sql`SELECT id FROM listings WHERE property_specs->>'seedTag' = ${seedMarker} LIMIT 1`;
      if (existingSeed.length === 0) {
        // 1. Multi-unit society: My Home Bhooja (Builder Floor Plans + 2 Individual Verified Owner Units)
        await sql`
          INSERT INTO listings (
            lister_id, latitude, longitude, price, property_type, listing_type, lister_type, status,
            bedrooms, bathrooms, built_up_area, carpet_area, area_unit,
            address, city, floor_number, total_floors, society_name, facing,
            contact_name, contact_phone, image_url, description, features, property_specs
          ) VALUES
          (
            ${ownerRow.id}, 17.4326, 78.3744, 34500000, 'apartment', 'sale', 'developer', 'active',
            3, 3, 2595, 2100, 'sqft',
            'My Home Bhooja, Silpa Gram Craft Village, Hitec City', 'Hyderabad', 18, 36, 'My Home Bhooja', 'E',
            'My Home Constructions', '+919848011223',
            'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=900&q=80',
            'Flagship luxury gated community in Hitec City with 75% open landscaped greens and central clubhouse.',
            '["Swimming Pool", "Club House", "Gym / Fitness Center", "Covered Parking", "Power Backup", "Security / CCTV", "Gated Community"]'::jsonb,
            ${JSON.stringify({
              seedTag: seedMarker,
              projectRera: "P02400000012",
              possessionStatus: "Ready to Move",
              builderConfigs: [
                { bhk: "3 BHK East", areaSqft: 2595, priceInr: 34500000, unitsAvailable: 4 },
                { bhk: "3 BHK West", areaSqft: 2680, priceInr: 36000000, unitsAvailable: 2 },
                { bhk: "4 BHK Sky Villa", areaSqft: 4070, priceInr: 58000000, unitsAvailable: 1 }
              ]
            })}::jsonb
          ),
          (
            ${ownerRow.id}, 17.4328, 78.3746, 32500000, 'apartment', 'sale', 'owner', 'active',
            3, 3, 2595, 2100, 'sqft',
            'Tower B, Flat 1404, My Home Bhooja, Hitec City', 'Hyderabad', 14, 36, 'My Home Bhooja', 'E',
            'Vikram Reddy (Owner)', '+919849022334',
            'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=900&q=80',
            'Direct owner resale in Tower B overlooking central park. No GST, modular kitchen, Shutterbug verified.',
            '["Air Conditioning", "Modular Kitchen", "Covered Parking", "Club House", "Swimming Pool", "Gated Community"]'::jsonb,
            ${JSON.stringify({
              seedTag: seedMarker,
              shutterbugVerified: true,
              possessionStatus: "Ready · No GST"
            })}::jsonb
          ),
          -- 2. Commercial Office (Crexi style: Cap Rate, Warm Shell, Pre-Leased)
          (
            ${ownerRow.id}, 17.4483, 78.3818, 65000000, 'commercial', 'sale', 'owner', 'active',
            null, 2, 4800, 3950, 'sqft',
            ' Mindspace Cyberabad Road, Madhapur, Hitec City', 'Hyderabad', 6, 14, 'Orbit Tech Park', 'N',
            'Arjun Mehta', '+919849133445',
            'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=900&q=80',
            'Grade-A pre-leased IT office suite with MNC tenant, 8.4% Cap Rate, 5-year lock-in, and 100% DG backup.',
            '["Power Backup", "Lift / Elevator", "Security / CCTV", "Covered Parking", "Air Conditioning"]'::jsonb,
            ${JSON.stringify({
              seedTag: seedMarker,
              subType: "Office Space",
              shellStatus: "Plug & Play",
              occupancyStatus: "Pre-Leased",
              capRatePct: "8.4%",
              monthlyRentInr: 456000,
              lockInYears: "5 Yrs",
              frontageFt: "60 ft",
              powerLoadKva: "120 kVA",
              parkingSlots: "6 Covered"
            })}::jsonb
          ),
          -- 3. Industrial Warehouse (Shamshabad ORR)
          (
            ${ownerRow.id}, 17.2403, 78.4294, 42000000, 'industrial', 'sale', 'owner', 'active',
            null, 2, 18500, 16000, 'sqft',
            'Exit 16 Outer Ring Road, Shamshabad Logistics Park', 'Hyderabad', 1, 1, 'ORR Logistics Hub', 'E',
            'Srinivas Rao', '+919849244556',
            'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=900&q=80',
            'PEB clear-span warehouse 1.2 km from Shamshabad ORR Exit 16 with 36 ft clear height and 4 hydraulic dock levellers.',
            '["Power Backup", "Security / CCTV", "24/7 Water Supply"]'::jsonb,
            ${JSON.stringify({
              seedTag: seedMarker,
              subType: "Warehouse / Godown",
              ceilingHeightFt: "36 ft",
              loadingDocks: "4 Docks",
              powerLoadKva: "250 kVA",
              floorCapacityTpsm: "6 T/m²",
              orrDistanceKm: "1.2 km",
              zoningType: "Industrial · Green"
            })}::jsonb
          ),
          -- 4. Agricultural / Farm Land (Shankarpally)
          (
            ${ownerRow.id}, 17.4561, 78.1322, 28000000, 'agricultural', 'sale', 'owner', 'active',
            null, null, 108900, 108900, 'sqft',
            'Shankarpally – Chevella Road, Ranga Reddy', 'Hyderabad', null, null, null, 'E',
            'Prakash Goud', '+919849355667',
            'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80',
            '2.5 Acres fertile red-soil mango orchard with 2 active borewells, drip irrigation, 40 ft BT road frontage, and Dharani clear title.',
            '["Garden / Landscape", "24/7 Water Supply", "Rain Water Harvesting"]'::jsonb,
            ${JSON.stringify({
              seedTag: seedMarker,
              subType: "Farm / Orchard",
              acres: "2.5 Acres",
              guntas: "2 Ac 20 Gu",
              pricePerAcre: "₹1.12 Cr/Ac",
              waterSource: "2 Borewells + Drip",
              soilType: "Red Soil",
              roadWidthFt: "40 ft BT Road",
              titleStatus: "Dharani Clear"
            })}::jsonb
          );
        `;
        console.log("✔ Seeded Hyderabad Multi-Unit Society, Commercial, Industrial & Agricultural listings");
      }
    }

    console.log("Migration completed successfully!");





  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

run();
