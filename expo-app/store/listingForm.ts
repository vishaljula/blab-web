import { create } from "zustand";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ListingType = "sale" | "rent";
export type PropertyType =
  | "apartment"
  | "independent_house"
  | "villa"
  | "plot"
  | "commercial"
  | "pg";

export type AreaUnit = "sqft" | "sqm";
export type Facing = "N" | "S" | "E" | "W" | "Corner";
export type PropertyAge = "new" | "lt5" | "5to10" | "10to20" | "gt20";
export type Furnishing = "unfurnished" | "semi" | "fully";
export type PreferredTenant = "family" | "bachelor" | "any";
export type ListingPath = "self" | "realtor";

export interface RealtorOption {
  id: string;
  name: string;
  // Rich profile fields from the DB
  photoUrl?: string | null;
  companyName?: string | null;
  reraNumber?: string | null;
  bio?: string | null;
  yearsExperience?: number | null;
  areasServed?: string[] | null;
  languagesSpoken?: string[] | null;
  scoreResponseRate?: number | null;
  distanceM?: number | null;
  totalDeals?: number | null;
  activeListingCount?: number | null;
  maxListingCapacity?: number | null;
  // Legacy fields kept for any remaining references
  dealsCount?: number;
  avgResponseHours?: number;
  isVerified?: boolean;
}

// Step counts per path
export const SELF_TOTAL_STEPS = 5;    // Type → Location → Path → Details+Price → Review
export const REALTOR_TOTAL_STEPS = 4; // Type → Location → Path → RealtorList

// ─── Store shape ───────────────────────────────────────────────────────────────

interface ListingFormState {
  // Step 1 — type + path
  listingType: ListingType | null;
  propertyType: PropertyType | null;
  listingPath: ListingPath | null;    // chosen in Step 1 — forks the flow

  // Step 2 — location
  address: string;
  latitude: number | null;
  longitude: number | null;
  locationConfirmed: boolean;          // explicit two-signal confirmation
  floorNumber: number | null;
  totalFloors: number | null;
  societyName: string;

  // Step 3 (self) — details + price
  bedrooms: number | null;
  bathrooms: number | null;
  carpetArea: number | null;
  areaUnit: AreaUnit;
  facing: Facing | null;
  propertyAge: PropertyAge | null;
  price: number | null;
  negotiable: boolean;
  securityDeposit: number | null;
  maintenance: number | null;
  furnishing: Furnishing | null;
  preferredTenant: PreferredTenant | null;
  availableFrom: string | null;

  // Step 4 (self) — description (optional) + review
  description: string;

  // Step 3 (realtor) — contact
  contactName: string;
  contactPhone: string;
  assignedRealtorId: string | null;

  // Realtor availability — prefetched after location confirmed
  realtorAvailability: "unknown" | "available" | "unavailable";

  // Wizard navigation
  currentStep: number;
  totalSteps: number;

  // Actions
  setStep1: (data: { listingType: ListingType; propertyType: PropertyType }) => void;
  setListingPath: (path: ListingPath) => void;  // Step 2 — path choice
  setStep2: (data: {
    address: string;
    latitude: number;
    longitude: number;
    locationConfirmed: boolean;
    floorNumber?: number | null;
    totalFloors?: number | null;
    societyName?: string;
  }) => void;
  confirmLocation: (lat: number, lng: number, address?: string) => void;
  setStep3Self: (data: {
    bedrooms?: number | null;
    bathrooms?: number | null;
    carpetArea?: number | null;
    areaUnit?: AreaUnit;
    facing?: Facing | null;
    propertyAge?: PropertyAge | null;
    price: number;
    negotiable?: boolean;
    securityDeposit?: number | null;
    maintenance?: number | null;
    furnishing?: Furnishing | null;
    preferredTenant?: PreferredTenant | null;
    availableFrom?: string | null;
  }) => void;
  setDescription: (description: string) => void;
  setRealtorContact: (data: {
    contactName: string;
    contactPhone: string;
    assignedRealtorId?: string | null;
  }) => void;
  setRealtorAvailability: (status: "unknown" | "available" | "unavailable") => void;
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: number) => void;
  reset: () => void;
}

// ─── Initial state ─────────────────────────────────────────────────────────────

const INITIAL: Omit<
  ListingFormState,
  | "setStep1" | "setStep2" | "confirmLocation"
  | "setStep3Self" | "setDescription" | "setRealtorContact"
  | "setListingPath" | "setRealtorAvailability"
  | "goNext" | "goBack" | "goToStep" | "reset"
> = {
  listingType: null,
  propertyType: null,
  listingPath: null,
  address: "",
  latitude: null,
  longitude: null,
  locationConfirmed: false,
  floorNumber: null,
  totalFloors: null,
  societyName: "",
  bedrooms: null,
  bathrooms: null,
  carpetArea: null,
  areaUnit: "sqft",
  facing: null,
  propertyAge: null,
  price: null,
  negotiable: true,
  securityDeposit: null,
  maintenance: null,
  furnishing: null,
  preferredTenant: null,
  availableFrom: null,
  description: "",
  contactName: "",
  contactPhone: "",
  assignedRealtorId: null,
  realtorAvailability: "unknown",
  currentStep: 1,
  totalSteps: SELF_TOTAL_STEPS,
};

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useListingFormStore = create<ListingFormState>((set) => ({
  ...INITIAL,

  setStep1: ({ listingType, propertyType }) =>
    set({ listingType, propertyType }),

  setListingPath: (path) =>
    set({
      listingPath: path,
      totalSteps: path === "realtor" ? REALTOR_TOTAL_STEPS : SELF_TOTAL_STEPS,
    }),

  setStep2: ({ address, latitude, longitude, locationConfirmed, floorNumber, totalFloors, societyName }) =>
    set({
      address,
      latitude,
      longitude,
      locationConfirmed,
      floorNumber: floorNumber ?? null,
      totalFloors: totalFloors ?? null,
      societyName: societyName ?? "",
    }),

  // Two-signal confirmation: user explicitly tapped/confirmed the pin
  confirmLocation: (lat, lng, address) =>
    set((s) => ({
      latitude: lat,
      longitude: lng,
      locationConfirmed: true,
      address: address ?? s.address,
    })),

  setStep3Self: ({ bedrooms, bathrooms, carpetArea, areaUnit, facing, propertyAge, price, negotiable, securityDeposit, maintenance, furnishing, preferredTenant, availableFrom }) =>
    set((s) => ({
      bedrooms: bedrooms ?? s.bedrooms,
      bathrooms: bathrooms ?? s.bathrooms,
      carpetArea: carpetArea ?? s.carpetArea,
      areaUnit: areaUnit ?? s.areaUnit,
      facing: facing ?? s.facing,
      propertyAge: propertyAge ?? s.propertyAge,
      price,
      negotiable: negotiable ?? s.negotiable,
      securityDeposit: securityDeposit ?? null,
      maintenance: maintenance ?? null,
      furnishing: furnishing ?? null,
      preferredTenant: preferredTenant ?? null,
      availableFrom: availableFrom ?? null,
    })),

  setDescription: (description) => set({ description }),

  setRealtorContact: ({ contactName, contactPhone, assignedRealtorId }) =>
    set({ contactName, contactPhone, assignedRealtorId: assignedRealtorId ?? null }),

  setRealtorAvailability: (status) => set({ realtorAvailability: status }),

  goNext: () =>
    set((s) => ({ currentStep: Math.min(s.currentStep + 1, s.totalSteps) })),

  goBack: () =>
    set((s) => ({ currentStep: Math.max(s.currentStep - 1, 1) })),

  goToStep: (step) =>
    set((s) => ({ currentStep: Math.min(Math.max(step, 1), s.currentStep) })),

  reset: () => set({ ...INITIAL }),
}));

// ─── Selectors ─────────────────────────────────────────────────────────────────

export const selectIsRealtorPath = (s: ListingFormState) => s.listingPath === "realtor";

/** Builds the POST body from current form state. */
export function buildListingPayload(state: ListingFormState): Record<string, unknown> {
  return {
    listingType: state.listingType,
    propertyType: state.propertyType,
    listerType: "owner",
    listingPath: state.listingPath,
    address: state.address,
    city: extractCity(state.address),
    latitude: state.latitude,
    longitude: state.longitude,
    floorNumber: state.floorNumber,
    totalFloors: state.totalFloors,
    societyName: state.societyName || null,
    bedrooms: state.bedrooms,
    bathrooms: state.bathrooms,
    carpetArea: state.carpetArea,
    areaUnit: state.areaUnit,
    facing: state.facing,
    price: state.price ?? 0,
    negotiable: state.negotiable,
    securityDeposit: state.securityDeposit,
    maintenance: state.maintenance,
    furnishing: state.furnishing,
    preferredTenant: state.preferredTenant,
    availableFrom: state.availableFrom,
    description: state.description || null,
    assignedRealtorId: state.assignedRealtorId,
    contactName: state.contactName || null,
    contactPhone: state.contactPhone || null,
  };
}

function extractCity(address: string): string {
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] ?? "Hyderabad";
}
