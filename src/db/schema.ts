import {
  pgTable,
  uuid,
  doublePrecision,
  integer,
  text,
  boolean,
  timestamp,
  index,
  pgEnum,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";

// Define user roles: buyer, owner, broker, developer
export const userRoleEnum = pgEnum("user_role", ["buyer", "owner", "broker", "developer"]);

// Listing lifecycle status
export const listingStatusEnum = pgEnum("listing_status", [
  "draft",              // realtor-path: waiting for realtor to complete
  "pending_photography",// self-list: paid, awaiting photographer
  "active",             // live and searchable
  "expired",            // 60-day TTL elapsed
  "closed",             // owner marked as sold/rented
]);

/**
 * Users table — stores user authentication sessions, roles, and encrypted PII.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    role: userRoleEnum("role").default("buyer").notNull(),
    
    // PII - Cryptographically hashed for quick index lookup
    phoneHash: varchar("phone_hash", { length: 64 }).unique(),
    emailHash: varchar("email_hash", { length: 64 }),
    
    // PII - Encrypted at application level (AES-256-GCM)
    encryptedName: text("encrypted_name"),
    encryptedPhone: text("encrypted_phone"),
    encryptedEmail: text("encrypted_email"),
    
    // Realtor/Developer Fields
    reraNumber: varchar("rera_number", { length: 50 }),
    companyName: varchar("company_name", { length: 100 }),
    projectCount: varchar("project_count", { length: 20 }),
    
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_users_role").on(table.role),
  ]
);

/**
 * Listings table — stores all property listings.
 *
 * Spatial queries (viewport, polygon) use raw SQL with PostGIS functions
 * on the latitude/longitude columns + a GiST index on a generated
 * geography column. See the migration in db/seed.ts for the PostGIS setup.
 */
export const listings = pgTable(
  "listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listerId: uuid("lister_id").references(() => users.id),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    price: integer("price").notNull(),
    propertyType: text("property_type").notNull(), // apartment, villa, house, plot, commercial, pg
    listingType: text("listing_type").notNull(),   // sale, rent
    listerType: text("lister_type").notNull(),     // owner, broker, developer

    // ─── Status & lifecycle ────────────────────────────────────────────────
    status: listingStatusEnum("status").default("pending_photography").notNull(),
    expiresAt: timestamp("expires_at"),            // set to createdAt + 60 days when going active

    // ─── Basic property details ────────────────────────────────────────────
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    builtUpArea: integer("built_up_area"),          // sq ft (legacy field — kept for compat)
    carpetArea: integer("carpet_area"),             // sq ft
    plotArea: integer("plot_area"),                 // sq ft (plots / independent houses)
    areaUnit: varchar("area_unit", { length: 10 }), // "sqft" | "sqm"

    // ─── Location details ──────────────────────────────────────────────────
    address: text("address").notNull(),
    city: text("city").notNull(),
    floorNumber: integer("floor_number"),
    totalFloors: integer("total_floors"),
    societyName: varchar("society_name", { length: 150 }),
    facing: varchar("facing", { length: 20 }),      // N / S / E / W / Corner

    // ─── Pricing & terms ───────────────────────────────────────────────────
    negotiable: boolean("negotiable").default(true),
    maintenance: integer("maintenance"),            // monthly maintenance (₹)
    securityDeposit: integer("security_deposit"),   // rental only
    availableFrom: timestamp("available_from"),     // rental: move-in date

    // ─── Rental-specific ───────────────────────────────────────────────────
    furnishing: varchar("furnishing", { length: 20 }),       // unfurnished / semi / fully
    preferredTenant: varchar("preferred_tenant", { length: 20 }), // family / bachelor / any

    // ─── Listing path ──────────────────────────────────────────────────────
    listingPath: varchar("listing_path", { length: 10 }),    // self / realtor
    assignedRealtorId: uuid("assigned_realtor_id").references(() => users.id),

    // ─── Media & contact ───────────────────────────────────────────────────
    imageUrl: text("image_url"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactPhotoUrl: text("contact_photo_url"),
    description: text("description"),
    yearBuilt: integer("year_built"),

    // JSONB allows structured sub-keys (interior, appliances, amenities)
    // while still being query-filterable. A text[] would lose nesting.
    features: jsonb("features"),
    marketEstimate: integer("market_estimate"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // B-tree index for listing_type filter (sale vs rent)
    index("idx_listings_type").on(table.listingType),
    // B-tree index on lat/lng for basic range queries (fallback)
    index("idx_listings_lat").on(table.latitude),
    index("idx_listings_lng").on(table.longitude),
    index("idx_listings_lister").on(table.listerId),
  ]
);

// TypeScript types inferred from schema
export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ListingRow = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
