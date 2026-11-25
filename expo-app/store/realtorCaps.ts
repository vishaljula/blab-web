/**
 * realtorCaps — the single auditable home for Option-B cap + Founding-500 data.
 *
 * Protected Surface #4 (`Founding 500 Pricing & Option B Fallback`) is *displayed*
 * here and *decided* on the server. This module exists so that every cap number
 * the Realtor Dashboard renders traces back to one normalizer and one derivation,
 * instead of being re-computed inline per bar (AUDIT-001 / E1, E2, D3).
 *
 * Deliberately free of `zustand`, `react-native` and `@/` alias imports so the
 * degradation contract below can be executed directly by a verification harness.
 * The only import is type-only and therefore erased at runtime.
 */
import type {
  DashboardStats,
  FoundingProgram,
  RealtorDashboard,
  RealtorProfile,
} from "./realtor";

/**
 * Starter (free) tier capacity — `free_trial` **and** `soft_cap`.
 * Mirrors `src/app/api/realtors/dashboard/route.ts:212-214`, where anything that
 * is not `pro` / `pro_plus` is granted 2 listings / 1 handoff. Used only as the
 * safe fallback when the server value is missing or malformed; the server value
 * always wins when present.
 */
export const STARTER_LISTING_CAP = 2;
export const STARTER_HANDOFF_CAP = 1;

/** Server constant for the Founding-500 seat count (`route.ts:235`). */
const FOUNDING_TOTAL_CAP = 500;

/**
 * Coerce a server number, degrading to `fallback` on `null` / `undefined` /
 * `NaN` / non-finite / non-numeric input, so no cap bar can ever render
 * `NaN`, `undefined` or `Infinity`.
 */
export function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalize the `/api/realtors/dashboard` payload at the store boundary.
 *
 * Degradation contract (AUDIT-001 / T1 acceptance criteria):
 *  - A missing or malformed capacity field degrades to the **Starter-safe**
 *    state (2 / 1). It must never degrade to an "unlimited" entitlement,
 *    because the server grants that only to `pro` / `pro_plus`.
 *  - Counts degrade to `0`, never to a client-derived proxy such as
 *    `myListings.length` — that proxy counted `draft` rows and is exactly the
 *    E2 defect.
 *  - `foundingProgram` degrades to `null` when the block is absent, so the
 *    panel hides rather than inventing program economics.
 *  - Arrays are `Array.isArray`-guarded per `CLAUDE.md` §1.
 *
 * Returns `null` for a response that is not a dashboard at all, which the store
 * surfaces as the existing "Couldn't load dashboard" retry state.
 */
export function normalizeDashboard(data: any): RealtorDashboard | null {
  if (!data || typeof data !== "object" || !data.realtor || typeof data.realtor !== "object") {
    return null;
  }

  const r: any = data.realtor;
  const fp: any = data.foundingProgram;
  const stats: any = (data.stats && typeof data.stats === "object") ? data.stats : {};

  const realtor: RealtorProfile = {
    ...r,
    name:                 typeof r.name === "string" && r.name.trim() ? r.name : "Realtor",
    realtorScore:         num(r.realtorScore, 0),
    scoreTierBase:        num(r.scoreTierBase, 0),
    trialSaleLeadsUsed:   num(r.trialSaleLeadsUsed, 0),
    trialRentalLeadsUsed: num(r.trialRentalLeadsUsed, 0),
    trialSaleLeadsMax:    num(r.trialSaleLeadsMax, 0),
    trialRentalLeadsMax:  num(r.trialRentalLeadsMax, 0),
    activeListingCount:   Math.max(0, num(r.activeListingCount, 0)),
    maxListingCapacity:   Math.max(1, num(r.maxListingCapacity, STARTER_LISTING_CAP)),
    maxHandoffCapacity:   Math.max(1, num(r.maxHandoffCapacity, STARTER_HANDOFF_CAP)),
    starterOverflowCount: Math.max(0, num(r.starterOverflowCount, 0)),
  };

  const foundingProgram: FoundingProgram | null =
    fp && typeof fp === "object"
      ? {
          totalCap:           Math.max(1, num(fp.totalCap, FOUNDING_TOTAL_CAP)),
          claimedCount:       Math.max(0, num(fp.claimedCount, 0)),
          annualPriceInr:     Math.max(0, num(fp.annualPriceInr, 0)),
          standardMonthlyInr: Math.max(0, num(fp.standardMonthlyInr, 0)),
          freeTrialThrough:   typeof fp.freeTrialThrough === "string" ? fp.freeTrialThrough : "",
          freeShootsIncluded: Math.max(0, num(fp.freeShootsIncluded, 0)),
          nearbyHandoffs14d:  Math.max(0, num(fp.nearbyHandoffs14d, 0)),
        }
      : null;

  const normalizedStats: DashboardStats = {
    openEnquiries:    Math.max(0, num(stats.openEnquiries, 0)),
    newEnquiries7d:   Math.max(0, num(stats.newEnquiries7d, 0)),
    upcomingViewings: Math.max(0, num(stats.upcomingViewings, 0)),
    activeListings:   Math.max(0, num(stats.activeListings, 0)),
  };

  return {
    realtor,
    foundingProgram,
    stats: normalizedStats,
    // Store defensive guard rule (CLAUDE.md §1) — JSON_AGG returns null for
    // empty nested sets, so guard the nested arrays too.
    myListings: Array.isArray(data.myListings)
      ? data.myListings.map((l: any) => ({
          ...l,
          recentEnquiries: Array.isArray(l?.recentEnquiries) ? l.recentEnquiries : [],
          viewings:        Array.isArray(l?.viewings)        ? l.viewings        : [],
        }))
      : [],
  };
}

/** Everything the dashboard banner needs. Every field traces to a server value. */
export interface CapState {
  /** True only when the server granted Pro capacity (999/999). */
  isPaidPro: boolean;
  listingCap: number;
  handoffCap: number;
  /** `activeListingCount`, display-clamped to `listingCap`. */
  activeListings: number;
  /** See the `activeHandoffs` caveat in the function body. */
  activeHandoffs: number;
  /** Server's Option-B overflow count — drives "N in Owner Fallback". */
  overflowCount: number;
  /** 0–1 fill fractions for the two cap bars. */
  listingFill: number;
  handoffFill: number;
}

/**
 * Derive the banner state from server values only.
 *
 * Entitlement is read from the server's **capacity grant**, never from
 * `subscriptionTier === "free_trial"`. That old branch handed `soft_cap`
 * realtors an "Unlimited Listings & Handoffs" banner while the server capped
 * them at 2/1 — AUDIT-001 / E1, and a direct misreport of Protected Surface #4.
 * The server's own test is `tier === "pro" || tier === "pro_plus"`
 * (`route.ts:212`), surfaced to the client as 999/999 capacity.
 *
 * Per CEO decision D1, only `pro` / `pro_plus` may present "unlimited" as a
 * current entitlement; `free_trial` and `soft_cap` both show the Starter 2/1 cap.
 */
export function deriveCapState(realtor: {
  activeListingCount: number;
  maxListingCapacity: number;
  maxHandoffCapacity: number;
  starterOverflowCount: number;
}): CapState {
  // Starter-safe: malformed capacity normalizes to 2/1, so this reads false.
  const listingCap = Math.max(1, num(realtor.maxListingCapacity, STARTER_LISTING_CAP));
  const handoffCap = Math.max(1, num(realtor.maxHandoffCapacity, STARTER_HANDOFF_CAP));
  const isPaidPro  = listingCap > STARTER_LISTING_CAP && handoffCap > STARTER_HANDOFF_CAP;

  const activeCount = Math.max(0, num(realtor.activeListingCount, 0));

  // Display clamps only — no client arithmetic invents a cap number (E2).
  const activeListings = Math.min(activeCount, listingCap);

  // KNOWN SERVER DATA GAP (flagged for Ticket 2, which holds the approved
  // unlock on `realtors/dashboard/route.ts`): the route returns no
  // `activeHandoffCount`. `/api/realtors/available` defines handoff-slot
  // occupancy as listings in ('draft','pending_photography','active'), so
  // clamping `activeListingCount` can under-report a slot held by a draft.
  // It is still strictly more correct than the `myListings.length` it replaces,
  // which counted sold and withdrawn rows as occupying the slot.
  const activeHandoffs = Math.min(activeCount, handoffCap);

  return {
    isPaidPro,
    listingCap,
    handoffCap,
    activeListings,
    activeHandoffs,
    overflowCount: Math.max(0, num(realtor.starterOverflowCount, 0)),
    listingFill: listingCap > 0 ? Math.min(1, activeListings / listingCap) : 0,
    handoffFill: handoffCap > 0 ? Math.min(1, activeHandoffs / handoffCap) : 0,
  };
}

/**
 * The Option-B overflow string. `"N in Owner Fallback"` is preserved **verbatim**
 * per Protected Surface #4 / critique §G — do not reword either branch.
 */
export function overflowLabel(overflowCount: number): string {
  return overflowCount > 0 ? `${overflowCount} in Owner Fallback` : "0 overflow";
}
