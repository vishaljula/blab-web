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
  bbox?: [number, number, number, number]; // [sw_lng, sw_lat, ne_lng, ne_lat]
  label?: string;
  center?: { lat: number; lng: number }; // For search result boundaries
  placeType?: string; // e.g. "CITY", "LOCALITY", "SUB_LOCALITY"
  geometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon; // Actual polygon from OSM
}

interface ListingsState {
  listings: Listing[];
  selectedListing: Listing | null;
  listingType: "sale" | "rent";
  viewportBounds: [number, number, number, number] | null;
  boundary: Boundary | null;
  drawActive: boolean;
  isLoading: boolean;

  setListings: (listings: Listing[]) => void;
  addListings: (newListings: Listing[]) => void; // merge + dedup by id
  setSelectedListing: (listing: Listing | null) => void;
  setListingType: (type: "sale" | "rent") => void;
  setViewportBounds: (bounds: [number, number, number, number]) => void;
  setBoundary: (boundary: Boundary | null) => void;
  updateBoundary: (boundary: Boundary) => void; // sets boundary WITHOUT resetting drawActive
  updateBoundaryGeometry: (geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) => void;
  toggleDraw: () => void;
  clearBoundary: () => void;
  setIsLoading: (loading: boolean) => void;
}

export const useListingsStore = create<ListingsState>((set) => ({
  listings: [],
  selectedListing: null,
  listingType: "sale",
  viewportBounds: null,
  boundary: null,
  drawActive: false,
  isLoading: false,

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
  updateBoundary: (boundary) => set({ boundary }), // keeps drawActive unchanged
  updateBoundaryGeometry: (geometry) =>
    set((state) => ({
      boundary: state.boundary ? { ...state.boundary, geometry } : state.boundary,
    })),
  toggleDraw: () =>
    set((state) => ({
      drawActive: !state.drawActive,
      boundary: state.drawActive ? state.boundary : null,
      // Clear viewport listings when entering draw mode so they don't
      // persist and merge with polygon-only results via addListings
      listings: state.drawActive ? state.listings : [],
    })),
  clearBoundary: () => set({ boundary: null, drawActive: false }),
  setIsLoading: (loading) => set({ isLoading: loading }),
}));
