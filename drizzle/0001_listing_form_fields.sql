-- Migration: listing_form_fields
-- Adds the listing_status enum + all fields needed by the multi-step listing
-- creation wizard. Columns that were already present in the DB (description,
-- features, contact_phone, contact_photo_url, year_built, maintenance,
-- market_estimate) are intentionally excluded — they were seeded via raw SQL
-- and are already tracked in schema.ts; drizzle's meta will be re-synced.

CREATE TYPE "public"."listing_status" AS ENUM('draft', 'pending_photography', 'active', 'expired', 'closed');--> statement-breakpoint

-- Status & lifecycle
ALTER TABLE "listings" ADD COLUMN "status" "listing_status" DEFAULT 'pending_photography' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint

-- Size fields
ALTER TABLE "listings" ADD COLUMN "carpet_area" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "area_unit" varchar(10);--> statement-breakpoint

-- Location detail
ALTER TABLE "listings" ADD COLUMN "floor_number" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "total_floors" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "society_name" varchar(150);--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "facing" varchar(20);--> statement-breakpoint

-- Pricing & terms
ALTER TABLE "listings" ADD COLUMN "negotiable" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "security_deposit" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "available_from" timestamp;--> statement-breakpoint

-- Rental-specific
ALTER TABLE "listings" ADD COLUMN "furnishing" varchar(20);--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "preferred_tenant" varchar(20);--> statement-breakpoint

-- Listing path & realtor assignment
ALTER TABLE "listings" ADD COLUMN "listing_path" varchar(10);--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "assigned_realtor_id" uuid;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_assigned_realtor_id_users_id_fk" FOREIGN KEY ("assigned_realtor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;