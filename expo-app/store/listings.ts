import { create } from "zustand";

export interface Listing {
  id: string;
  latitude: number;
  longitude: number;
  price: number;
  propertyType: string;
  listingType: "sale" | "rent";
  listerType: "owner" | "broker" | "developer";
  bedrooms?: number;
  bathrooms?: number;
  builtUpArea?: number;
  plotArea?: number;
  address: string;
  city: string;
  imageUrl?: string;
  contactName?: string;
}

export interface Boundary {
  type: "city" | "polygon";
  coordinates?: number[][];
  bbox?: [number, number, number, number];
  label?: string;
  center?: { lat: number; lng: number };
  placeType?: string;
}

interface ListingsState {
  listings: Listing[];
  selectedListing: Listing | null;
  listingType: "sale" | "rent";
  viewportBounds: [number, number, number, number] | null;
  boundary: Boundary | null;
  drawActive: boolean;
  isLoading: boolean;
  authModalOpen: boolean;

  setListings: (listings: Listing[]) => void;
  addListings: (newListings: Listing[]) => void;
  setSelectedListing: (listing: Listing | null) => void;
  setListingType: (type: "sale" | "rent") => void;
  setViewportBounds: (bounds: [number, number, number, number]) => void;
  setBoundary: (boundary: Boundary | null) => void;
  toggleDraw: () => void;
  clearBoundary: () => void;
  setIsLoading: (loading: boolean) => void;
  setAuthModalOpen: (open: boolean) => void;
}

export const useListingsStore = create<ListingsState>((set) => ({
  listings: [],
  selectedListing: null,
  listingType: "sale",
  viewportBounds: null,
  boundary: null,
  drawActive: false,
  isLoading: false,
  authModalOpen: false,

  setListings: (listings) => set({ listings }),
  addListings: (newListings) =>
    set((state) => {
      const existingIds = new Set(state.listings.map((l) => l.id));
      const unique = newListings.filter((l) => !existingIds.has(l.id));
      return { listings: [...state.listings, ...unique] };
    }),
  setSelectedListing: (listing) => set({ selectedListing: listing }),
  setListingType: (type) => set({ listingType: type }),
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  setBoundary: (boundary) => set({ boundary, drawActive: false }),
  toggleDraw: () =>
    set((state) => ({
      drawActive: !state.drawActive,
      boundary: state.drawActive ? state.boundary : null,
      listings: state.drawActive ? state.listings : [],
    })),
  clearBoundary: () => set({ boundary: null, drawActive: false, listings: [] }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setAuthModalOpen: (open) => set({ authModalOpen: open }),
}));
