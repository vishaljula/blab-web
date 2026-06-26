import {
  pgTable,
  uuid,
  doublePrecision,
  integer,
  text,
  timestamp,
  index,
  pgEnum,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";

// Define user roles: buyer, owner, broker, developer
export const userRoleEnum = pgEnum("user_role", ["buyer", "owner", "broker", "developer"]);

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
    listerId: uuid("lister_id").references(() => users.id), // Link listing to creator
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    price: integer("price").notNull(),
    propertyType: text("property_type").notNull(), // apartment, villa, house, plot, commercial
    listingType: text("listing_type").notNull(),   // sale, rent
    listerType: text("lister_type").notNull(),     // owner, broker, developer
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    builtUpArea: integer("built_up_area"),
    plotArea: integer("plot_area"),
    address: text("address").notNull(),
    city: text("city").notNull(),
    imageUrl: text("image_url"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactPhotoUrl: text("contact_photo_url"),
    description: text("description"),
    yearBuilt: integer("year_built"),
    maintenance: integer("maintenance"),
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
