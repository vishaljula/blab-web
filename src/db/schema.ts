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

/** Every person on Blab — buyer, seller, realtor, developer, or shutterbug (field photographer). */
// Role architecture:
//   user      — any regular person: can browse AND list their own property (replaces buyer+owner)
//   developer — B2B builder/developer (MyHome, Prestige etc.) — project-level listings, Phase 2 product
//   realtor   — licensed agent listing on behalf of owners, has dashboard + quota
//   shutterbug — Blab field photographer, receives job dispatch notifications
// buyer/owner kept in enum for backwards compat with existing rows only.
export const userRoleEnum = pgEnum("user_role", ["user", "buyer", "owner", "realtor", "developer", "shutterbug"]);

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
    role: userRoleEnum("role").default("user").notNull(),

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

    // ── Shutterbug (field photographer) ─────────────────────────────────────
    /** Expo push notification token — used for round-robin job dispatch. */
    pushToken: text("push_token"),
    /** Timestamp of last job dispatch — used for round-robin fairness (LRU ordering). */
    lastDispatchedAt: timestamp("last_dispatched_at"),
    /** H3 res7 cell this shutterbug primarily operates in (null = city-wide). */
    operatingH3Cell: text("operating_h3_cell"),

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

// ─── Service Config ───────────────────────────────────────────────────────────

/**
 * Single-row table storing the active service zone and time window config.
 * Only one row (id = 'default') should ever exist.
 * Editable by admin — changing radius or center instantly affects availability.
 */
export const serviceConfig = pgTable("service_config", {
  id: varchar("id", { length: 20 }).primaryKey().default("default"),

  /** L.B. Nagar service zone center. */
  zoneCenterLat:  doublePrecision("zone_center_lat").notNull().default(17.3496),
  zoneCenterLng:  doublePrecision("zone_center_lng").notNull().default(78.5521),
  /** Service zone radius in kilometres. */
  zoneRadiusKm:   doublePrecision("zone_radius_km").notNull().default(5),

  /**
   * Time windows as a JSON array of { id, label, startHour, startMin, endHour, endMin }.
   * Default: 4 windows covering 9 AM – 7 PM.
   */
  timeWindows: jsonb("time_windows").notNull().default(
    JSON.parse(JSON.stringify([
      { id: "A", label: "Morning",       startHour: 9,  startMin: 0,  endHour: 11, endMin: 0  },
      { id: "B", label: "Late Morning",  startHour: 11, startMin: 30, endHour: 13, endMin: 30 },
      { id: "C", label: "Afternoon",     startHour: 14, startMin: 30, endHour: 16, endMin: 30 },
      { id: "D", label: "Evening",       startHour: 17, startMin: 0,  endHour: 19, endMin: 0  },
    ]))
  ),

  /** Minimum hours notice before a slot can be booked (prevents same-hour bookings). */
  minLeadTimeHours: integer("min_lead_time_hours").notNull().default(3),
  /** How many days into the future slots are shown. */
  bookingWindowDays: integer("booking_window_days").notNull().default(10),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ServiceConfig = typeof serviceConfig.$inferSelect;

// ─── Photography Bookings ─────────────────────────────────────────────────────

/**
 * One row per confirmed photography shoot booking.
 * Status lifecycle: pending → confirmed → en_route → completed | cancelled | no_show
 */
export const photographyBookings = pgTable(
  "photography_bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId:  uuid("listing_id").references(() => listings.id).notNull(),
    customerId: uuid("customer_id").references(() => users.id).notNull(),

    /** ISO date string YYYY-MM-DD of the booked shoot. */
    slotDate:   varchar("slot_date", { length: 10 }).notNull(),
    /** Time window identifier: A | B | C | D. */
    slotWindow: varchar("slot_window", { length: 1 }).notNull(),

    /**
     * pending    — booked, awaiting admin confirmation
     * confirmed  — admin confirmed, shutterbug assigned
     * en_route   — shutterbug tapped "I'm heading there"
     * completed  — shoot finished
     * cancelled  — customer or admin cancelled
     * no_show    — customer was not home
     */
    status: varchar("status", { length: 20 }).notNull().default("pending"),

    /** Assigned after admin reviews the booking. */
    assignedShutterbugId: uuid("assigned_shutterbug_id").references(() => users.id),

    /** Optional notes from customer (gate code, parking, access instructions). */
    customerNotes: text("customer_notes"),

    /** H3 res7 cell of the property — used for zone-aware capacity queries. */
    propertyH3Cell: text("property_h3_cell"),

    /** 'marketing' | 'organic' — for supply analytics. */
    bookingSource: varchar("booking_source", { length: 20 }).default("organic"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_photo_bookings_slot").on(table.slotDate, table.slotWindow),
    index("idx_photo_bookings_listing").on(table.listingId),
    index("idx_photo_bookings_shutterbug").on(table.assignedShutterbugId, table.slotDate),
  ]
);

export type PhotographyBookingRow = typeof photographyBookings.$inferSelect;
export type NewPhotographyBooking = typeof photographyBookings.$inferInsert;

// ─── Photography Waitlist ─────────────────────────────────────────────────────

/**
 * Captures requests from customers whose property is outside the active service zone.
 * When the zone expands or a shutterbug is added in their area, they are notified.
 */
export const photographyWaitlist = pgTable(
  "photography_waitlist",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId:  uuid("listing_id").references(() => listings.id),
    customerId: uuid("customer_id").references(() => users.id).notNull(),

    /** Human-readable address for admin dashboard. */
    propertyAddress: text("property_address"),
    propertyLat: doublePrecision("property_lat"),
    propertyLng: doublePrecision("property_lng"),
    /** H3 res7 cell — used to group waitlisted demand by zone for expansion decisions. */
    propertyH3Cell: text("property_h3_cell"),

    /** Queue position within this H3 cell (1-indexed). Set at insert time. */
    queuePosition: integer("queue_position"),

    /**
     * waiting   — in queue, not yet notified
     * notified  — we sent them a "zone now available" message
     * booked    — converted to a photography_booking
     * expired   — never converted (listing closed/expired)
     */
    status: varchar("status", { length: 20 }).notNull().default("waiting"),

    /** Set when we notify them that their zone is now served. */
    notifiedAt: timestamp("notified_at"),
    /** Set when they convert to an actual booking. */
    convertedBookingId: uuid("converted_booking_id"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_waitlist_h3").on(table.propertyH3Cell, table.status),
    index("idx_waitlist_customer").on(table.customerId),
  ]
);

export type PhotographyWaitlistRow = typeof photographyWaitlist.$inferSelect;
export type NewPhotographyWaitlistEntry = typeof photographyWaitlist.$inferInsert;
