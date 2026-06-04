CREATE TYPE "public"."user_role" AS ENUM('buyer', 'owner', 'broker', 'developer');--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lister_id" uuid,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"price" integer NOT NULL,
	"property_type" text NOT NULL,
	"listing_type" text NOT NULL,
	"lister_type" text NOT NULL,
	"bedrooms" integer,
	"bathrooms" integer,
	"built_up_area" integer,
	"plot_area" integer,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"image_url" text,
	"contact_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
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
--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_lister_id_users_id_fk" FOREIGN KEY ("lister_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_listings_type" ON "listings" USING btree ("listing_type");--> statement-breakpoint
CREATE INDEX "idx_listings_lat" ON "listings" USING btree ("latitude");--> statement-breakpoint
CREATE INDEX "idx_listings_lng" ON "listings" USING btree ("longitude");--> statement-breakpoint
CREATE INDEX "idx_listings_lister" ON "listings" USING btree ("lister_id");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");