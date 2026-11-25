/**
 * Realtor portal state — property-centric dashboard.
 * Each listing the realtor manages includes its nested enquiries and viewings.
 */
import { create } from "zustand";
import { API_BASE_URL } from "@/lib/theme";
import { normalizeDashboard } from "./realtorCaps";

export { deriveCapState, overflowLabel } from "./realtorCaps";
export type { CapState } from "./realtorCaps";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubscriptionTier = "free_trial" | "soft_cap" | "pro" | "pro_plus";

export interface RealtorProfile {
  id: string;
  name: string;
  companyName?: string;
  photoUrl?: string;
  subscriptionTier: SubscriptionTier;
  realtorScore: number;
  scoreTierBase: number;
  trialSaleLeadsUsed: number;
  trialRentalLeadsUsed: number;
  trialSaleLeadsMax: number;
  trialRentalLeadsMax: number;
  /**
   * Server-authoritative Option-B cap fields (`/api/realtors/dashboard`).
   * NEVER re-derive these on the client — `myListings.length` includes `draft`
   * rows and over-reports the cap (AUDIT-001 / E2). Protected Surface #4.
   */
  activeListingCount: number;
  maxListingCapacity: number;
  maxHandoffCapacity: number;
  starterOverflowCount: number;
}

/**
 * Founding-500 program economics — all values server-computed.
 * Never retype these as client string literals (AUDIT-001 / D1, D4).
 */
export interface FoundingProgram {
  totalCap: number;
  claimedCount: number;
  annualPriceInr: number;
  standardMonthlyInr: number;
  /** ISO date (`YYYY-MM-DD`) the free period runs through. */
  freeTrialThrough: string;
  freeShootsIncluded: number;
  /** Live count of handoffs assigned nearby in the last **14 days** (not "this week"). */
  nearbyHandoffs14d: number;
}

/** A buyer's enquiry about a specific listing. */
export interface Enquiry {
  id: string;
  requesterName?: string;
  requesterPhone?: string;
  createdAt: string;
  respondedAt?: string | null;
  responseChannel?: "whatsapp" | "call" | "in_app" | null;
}

/** A viewing (tour/visit) for a listing. */
export interface ViewingSlot {
  id: string;
  scheduledAt: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  durationMins: number;
  buyerName?: string | null;  // decrypted from users.encrypted_name via buyer_id JOIN
}

/** A listing assigned to this realtor, enriched with enquiry + viewing data. */
export interface ManagedListing {
  id: string;
  address: string;
  city: string;
  price: number;
  propertyType: string;
  listingType: "sale" | "rent";
  bedrooms?: number;
  imageUrl?: string;
  status: string;
  contactName?: string;
  contactPhone?: string;
  enquiryCount: number;
  openEnquiryCount: number;
  upcomingViewingCount: number;
  totalViewingCount: number;
  nextViewingAt: string | null;
  recentEnquiries: Enquiry[];
  viewings: ViewingSlot[];
}

export interface DashboardStats {
  openEnquiries: number;
  newEnquiries7d: number;
  upcomingViewings: number;
  activeListings: number;
}

export interface RealtorDashboard {
  realtor: RealtorProfile;
  /** `null` when the server omits the block — consumers must hide, never fabricate. */
  foundingProgram: FoundingProgram | null;
  stats: DashboardStats;
  myListings: ManagedListing[];
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface RealtorState {
  dashboard: RealtorDashboard | null;
  isLoadingDashboard: boolean;
  error: string | null;

  fetchDashboard: (token: string) => Promise<void>;
  respondToEnquiry: (token: string, leadId: string, channel: string, listingId: string) => Promise<void>;
  clearDashboard: () => void;
}

export const useRealtorStore = create<RealtorState>((set, get) => ({
  dashboard: null,
  isLoadingDashboard: false,
  error: null,

  fetchDashboard: async (token: string) => {
    set({ isLoadingDashboard: true, error: null });
    try {
      const res = await fetch(`${API_BASE_URL}/api/realtors/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      const dashboard = normalizeDashboard(await res.json());
      if (!dashboard) throw new Error("Malformed dashboard response");
      set({ dashboard, isLoadingDashboard: false });
    } catch (e: any) {
      set({ error: e.message, isLoadingDashboard: false });
    }
  },

  respondToEnquiry: async (token: string, leadId: string, channel: string, listingId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/realtors/leads/${leadId}/respond`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ responseChannel: channel }),
      });
      // Optimistically mark as responded in local state
      set((state) => {
        if (!state.dashboard) return state;
        return {
          dashboard: {
            ...state.dashboard,
            myListings: state.dashboard.myListings.map((l) => {
              if (l.id !== listingId) return l;
              return {
                ...l,
                openEnquiryCount: Math.max(0, l.openEnquiryCount - 1),
                recentEnquiries: l.recentEnquiries.map((e) =>
                  e.id === leadId
                    ? { ...e, respondedAt: new Date().toISOString(), responseChannel: channel as any }
                    : e
                ),
              };
            }),
            stats: {
              ...state.dashboard.stats,
              openEnquiries: Math.max(0, state.dashboard.stats.openEnquiries - 1),
            },
          },
        };
      });
    } catch {}
  },

  clearDashboard: () => set({ dashboard: null, error: null }),
}));
