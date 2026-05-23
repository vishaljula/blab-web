import {
  pgTable,
  uuid,
  doublePrecision,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // B-tree index for listing_type filter (sale vs rent)
    index("idx_listings_type").on(table.listingType),
    // B-tree index on lat/lng for basic range queries (fallback)
    index("idx_listings_lat").on(table.latitude),
    index("idx_listings_lng").on(table.longitude),
  ]
);

// TypeScript type inferred from schema — used in API responses
export type ListingRow = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
