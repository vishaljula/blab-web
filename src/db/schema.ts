import {
  pgTable,
  uuid,
  doublePrecision,
  integer,
  smallint,
  numeric,
  text,
  boolean,
  timestamp,
  index,
  pgEnum,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Every person on Blab — buyer, seller, realtor, or developer. */
export const userRoleEnum = pgEnum("user_role", ["buyer", "owner", "realtor", "developer"]);

/**
 * Realtor subscription tiers.
 *  free_trial — 3 sale + 3 rental leads (lifetime), then moves to soft_cap
 *  soft_cap   — 1 sale + 1 rental per calendar month, excluded from most searches
 *  pro        — ₹3,000/month, unlimited routing, 5→10 active listing capacity
 *  pro_plus   — ₹6,000/month, always ranks above pro, 8→15 active listing capacity
 */
export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "free_trial",
  "soft_cap",
  "pro",
  "pro_plus",
]);

/** Listing lifecycle status. */
export const listingStatusEnum = pgEnum("listing_status", [
  "draft",               // realtor-path: waiting for realtor to complete
  "pending_photography", // self-list: paid, awaiting photographer
  "active",              // live and searchable
  "expired",             // 60-day TTL elapsed
  "closed",              // owner marked as sold/rented
]);

// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * Single users table for all roles.
 * Realtor-specific columns are null for buyers/sellers.
 * base_location geography(POINT,4326) is managed in migrate.ts (PostGIS).
 * h3_index_res9 generated column is also in migrate.ts (H3 extension).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    role: userRoleEnum("role").default("buyer").notNull(),

    // PII — hashed for index lookup
    phoneHash: varchar("phone_hash", { length: 64 }).unique(),
    emailHash: varchar("email_hash", { length: 64 }),

    // PII — AES-256-GCM encrypted at application level
    encryptedName: text("encrypted_name"),
    encryptedPhone: text("encrypted_phone"),
    encryptedEmail: text("encrypted_email"),

    // Developer / Realtor shared fields
    reraNumber: varchar("rera_number", { length: 50 }),
    companyName: varchar("company_name", { length: 100 }),
    projectCount: varchar("project_count", { length: 20 }),

    // ── Realtor profile ─────────────────────────────────────────────────────
    photoUrl: text("photo_url"),
    bio: text("bio"),
    yearsExperience: smallint("years_experience"),
    /** Lifetime completed deals — manually set at signup, auto-incremented on realtor_closings insert. */
    totalDeals: integer("total_deals").default(0),
    languagesSpoken: jsonb("languages_spoken"),  // string[]
    areasServed: jsonb("areas_served"),           // string[] — display-only, not used for routing

    /** Realtor's registered base coordinates. The PostGIS base_location geography
     *  column is generated from these two in migrate.ts (same pattern as listings). */
    realtorLatitude: doublePrecision("realtor_latitude"),
    realtorLongitude: doublePrecision("realtor_longitude"),

    // ── Subscription / trial ────────────────────────────────────────────────
    subscriptionTier: subscriptionTierEnum("subscription_tier").default("free_trial"),

    /** Set at onboarding completion — trial clock starts immediately. */
    trialStartedAt: timestamp("trial_started_at"),

    /** Split trial caps: sale and rental tracked independently.
     *  Exhausting one does not affect the other. Each starts at 3. */
    trialSaleLeadsUsed: smallint("trial_sale_leads_used").default(0),
    trialRentalLeadsUsed: smallint("trial_rental_leads_used").default(0),

    /** Monthly soft cap counters. Reset self-heal via soft_cap_month check. */
    softCapSaleLeadsMonth: smallint("soft_cap_sale_leads_month").default(0),
    softCapRentalLeadsMonth: smallint("soft_cap_rental_leads_month").default(0),

    /** YYYY-MM of the current soft cap period. If this != current month,
     *  counters are treated as 0 and updated in the same transaction as the lead. */
    softCapMonth: varchar("soft_cap_month", { length: 7 }),

    /** Leads routed beyond the monthly soft cap (overflow). Used for supply analytics. */
    softCapOverflowLeads: smallint("soft_cap_overflow_leads").default(0),

    /** When this realtor last received a lead. Tiebreaker for trial-tier fairness. */
    lastLeadAssignedAt: timestamp("last_lead_assigned_at"),

    // ── Ranking score ───────────────────────────────────────────────────────
    /** Persistent composite score used for all ranking queries. Sum of components below. */
    realtorScore: integer("realtor_score").default(0),
    scoreTierBase: integer("score_tier_base").default(0),       // 0/1000/5000/10000 by tier
    scoreResponseRate: smallint("score_response_rate").default(0),  // 0–200 (% * 2)
    scoreResponseSpeed: smallint("score_response_speed").default(0), // 0–200 (speed bucket)
    scoreListingActivity: smallint("score_listing_activity").default(0), // 0–200
    scoreReviews: smallint("score_reviews").default(0),          // 0–200 (avg * 40)
    scoreProfile: smallint("score_profile").default(0),          // 0–100 (completeness)
    scoreTenure: smallint("score_tenure").default(0),            // 0–99 (capped)

    // ── Capacity (pre-computed, event-driven) ───────────────────────────────
    /** How many active listings are currently assigned to this realtor.
     *  Incremented on assignment, decremented on listing close/removal. */
    activeListingCount: smallint("active_listing_count").default(0),

    /** Dynamic capacity ceiling = f(tier, score_response_rate).
     *  Recomputed and stored in same transaction as score_response_rate changes.
     *  Trial: 2 | SoftCap: 1 | Pro: LEAST(10, 5 + FLOOR(score_response_rate/50))
     *  Pro+: LEAST(15, 8 + FLOOR(score_response_rate/50)) */
    maxListingCapacity: smallint("max_listing_capacity").default(2),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_users_role").on(table.role),
    // Realtor-specific indexes are created in migrate.ts (PostGIS GIST + partial score index)
  ]
);

// ─── Listings ─────────────────────────────────────────────────────────────────

/**
 * Listings table — stores all property listings.
 *
 * Three generated columns are managed by Postgres (not Drizzle ORM):
 *   location       geography(POINT, 4326)  — PostGIS GIST index
 *   h3_index_res7  h3index                 — H3 res7 B-tree index
 *   h3_index_res9  h3index                 — H3 res9 B-tree index
 *
 * See db/migrate.ts for PostGIS + H3 setup.
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
    listerType: text("lister_type").notNull(),     // owner, realtor, developer

    // ─── Status & lifecycle ────────────────────────────────────────────────
    status: listingStatusEnum("status").default("pending_photography").notNull(),
    expiresAt: timestamp("expires_at"),

    // ─── Basic property details ───────────────────────────────────────────
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    builtUpArea: integer("built_up_area"),
    carpetArea: integer("carpet_area"),
    plotArea: integer("plot_area"),
    areaUnit: varchar("area_unit", { length: 10 }),

    // ─── Location details ─────────────────────────────────────────────────
    address: text("address").notNull(),
    city: text("city").notNull(),
    floorNumber: integer("floor_number"),
    totalFloors: integer("total_floors"),
    societyName: varchar("society_name", { length: 150 }),
    facing: varchar("facing", { length: 20 }),

    // ─── Pricing & terms ──────────────────────────────────────────────────
    negotiable: boolean("negotiable").default(true),
    maintenance: integer("maintenance"),
    securityDeposit: integer("security_deposit"),
    availableFrom: timestamp("available_from"),

    // ─── Rental-specific ─────────────────────────────────────────────────
    furnishing: varchar("furnishing", { length: 20 }),
    preferredTenant: varchar("preferred_tenant", { length: 20 }),

    // ─── Listing path ─────────────────────────────────────────────────────
    listingPath: varchar("listing_path", { length: 10 }),  // self | realtor
    assignedRealtorId: uuid("assigned_realtor_id").references(() => users.id),

    // ─── Media & contact ──────────────────────────────────────────────────
    imageUrl: text("image_url"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactPhotoUrl: text("contact_photo_url"),
    description: text("description"),
    yearBuilt: integer("year_built"),
    features: jsonb("features"),
    marketEstimate: integer("market_estimate"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_listings_type").on(table.listingType),
    index("idx_listings_lister").on(table.listerId),
    // Partial B-tree for realtor assignment lookups — O(log N)
    index("idx_listings_assigned_realtor").on(table.assignedRealtorId),
  ]
);

// ─── Leads ────────────────────────────────────────────────────────────────────

/**
 * One row per buyer enquiry or seller listing request sent to a realtor.
 * Created immediately on tap — no confirmation step (industry standard).
 * Trial/soft cap counters are incremented in the same transaction.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    realtorId: uuid("realtor_id").references(() => users.id).notNull(),
    listingId: uuid("listing_id").references(() => listings.id),
    requesterId: uuid("requester_id").references(() => users.id),

    /** Captured at creation so it survives account deletion. */
    requesterPhone: text("requester_phone"),
    requesterName: text("requester_name"),

    /** buyer_enquiry | seller_listing_request */
    type: text("type").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),

    /** Set when the realtor first replies. Null = unresponded. */
    respondedAt: timestamp("responded_at"),

    /** whatsapp | call | in_app */
    responseChannel: text("response_channel"),

    closedAt: timestamp("closed_at"),

    /** converted | lost | no_response | duplicate */
    outcome: text("outcome"),

    /** Private realtor-only notes, never shown to buyer/seller. */
    notes: text("notes"),
  },
  (table) => [
    // Primary access pattern: a realtor's leads, newest first
    index("idx_leads_realtor_created").on(table.realtorId, table.createdAt),
    // For responsiveness gate check: unresponded leads on active listings
    index("idx_leads_listing").on(table.listingId),
  ]
);

// ─── Viewings ─────────────────────────────────────────────────────────────────

/** One row per scheduled property visit. */
export const viewings = pgTable(
  "viewings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id").references(() => listings.id),
    realtorId: uuid("realtor_id").references(() => users.id),
    buyerId: uuid("buyer_id").references(() => users.id),

    scheduledAt: timestamp("scheduled_at").notNull(),
    durationMins: integer("duration_mins").default(30),

    /** pending | confirmed | cancelled | completed */
    status: text("status").default("pending").notNull(),
    cancellationReason: text("cancellation_reason"),

    /** Realtor-only notes added after the visit. */
    notes: text("notes"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Primary access: a realtor's upcoming viewings
    index("idx_viewings_realtor_scheduled").on(table.realtorId, table.scheduledAt),
    index("idx_viewings_listing").on(table.listingId),
  ]
);

// ─── Realtor Closings ─────────────────────────────────────────────────────────

/** One row per completed deal. Created when a realtor marks a lead as converted. */
export const realtorClosings = pgTable(
  "realtor_closings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    realtorId: uuid("realtor_id").references(() => users.id).notNull(),
    listingId: uuid("listing_id").references(() => listings.id),
    leadId: uuid("lead_id").references(() => leads.id),

    closedAt: timestamp("closed_at").defaultNow().notNull(),
    salePrice: integer("sale_price"),

    /** Optional — realtor-only visibility. */
    commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }),
    notes: text("notes"),
  },
  (table) => [
    index("idx_closings_realtor").on(table.realtorId, table.closedAt),
  ]
);

// ─── Realtor Reviews ──────────────────────────────────────────────────────────

/** One star rating + optional written review, submitted after a closing. */
export const realtorReviews = pgTable(
  "realtor_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    realtorId: uuid("realtor_id").references(() => users.id).notNull(),
    reviewerId: uuid("reviewer_id").references(() => users.id),
    listingId: uuid("listing_id").references(() => listings.id),

    /** 1–5 stars. */
    rating: smallint("rating").notNull(),
    reviewText: text("review_text"),

    /** buyer | seller — who is leaving the review. */
    reviewerRole: text("reviewer_role"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_reviews_realtor").on(table.realtorId, table.createdAt),
  ]
);

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ListingRow = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type LeadRow = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type ViewingRow = typeof viewings.$inferSelect;
export type NewViewing = typeof viewings.$inferInsert;
export type RealtorClosingRow = typeof realtorClosings.$inferSelect;
export type NewRealtorClosing = typeof realtorClosings.$inferInsert;
export type RealtorReviewRow = typeof realtorReviews.$inferSelect;
export type NewRealtorReview = typeof realtorReviews.$inferInsert;
