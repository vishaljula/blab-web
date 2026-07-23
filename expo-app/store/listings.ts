import { create } from "zustand";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "@/lib/theme";

export const getStoredAuth = async () => {
  try {
    if (Platform.OS === "web") {
      const token = localStorage.getItem("auth_token");
      const userStr = localStorage.getItem("auth_user");
      return { token, user: userStr ? JSON.parse(userStr) : null };
    } else {
      const token = await SecureStore.getItemAsync("auth_token");
      const userStr = await SecureStore.getItemAsync("auth_user");
      return { token, user: userStr ? JSON.parse(userStr) : null };
    }
  } catch {
    return { token: null, user: null };
  }
};

export const saveStoredAuth = async (token: string | null, user: any | null) => {
  try {
    if (Platform.OS === "web") {
      if (token) {
        localStorage.setItem("auth_token", token);
        localStorage.setItem("auth_user", JSON.stringify(user));
      } else {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
      }
    } else {
      if (token) {
        await SecureStore.setItemAsync("auth_token", token);
        await SecureStore.setItemAsync("auth_user", JSON.stringify(user));
      } else {
        await SecureStore.deleteItemAsync("auth_token");
        await SecureStore.deleteItemAsync("auth_user");
      }
    }
  } catch {}
};

export interface Listing {
  id: string;
  latitude: number;
  longitude: number;
  price: number;
  propertyType: string;
  listingType: "sale" | "rent";
  listerType: "owner" | "realtor" | "developer";
  bedrooms?: number;
  bathrooms?: number;
  builtUpArea?: number;
  plotArea?: number;
  address: string;
  city: string;
  imageUrl?: string;
  contactName?: string;
  contactPhone?: string;
  contactPhotoUrl?: string;
  description?: string;
  yearBuilt?: number;
  maintenance?: number;
  features?: any;
  marketEstimate?: number;
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
  total: number;          // actual listing count in current viewport (not just H3 representatives)
  selectedListing: Listing | null;
  listingType: "sale" | "rent";
  viewportBounds: [number, number, number, number] | null;
  boundary: Boundary | null;
  drawActive: boolean;
  isLoading: boolean;
  authModalOpen: boolean;
  token: string | null;
  user: any | null;
 
  mapRefreshTick: number;
  detailModalId: string | null;
  currentZoom: number;
  setListings: (listings: Listing[]) => void;
  setTotal: (total: number) => void;
  addListings: (newListings: Listing[]) => void;
  setSelectedListing: (listing: Listing | null) => void;
  setListingType: (type: "sale" | "rent") => void;
  setViewportBounds: (bounds: [number, number, number, number]) => void;
  setBoundary: (boundary: Boundary | null) => void;
  toggleDraw: () => void;
  clearBoundary: () => void;
  setIsLoading: (loading: boolean) => void;
  setAuthModalOpen: (open: boolean) => void;
  setAuth: (token: string | null, user: any | null) => void;
  bumpMapRefresh: () => void;
  setDetailModalId: (id: string | null) => void;
  setCurrentZoom: (zoom: number) => void;
}

export const useListingsStore = create<ListingsState>((set) => ({
  listings: [],
  total: 0,
  selectedListing: null,
  listingType: "sale",
  viewportBounds: null,
  mapRefreshTick: 0,
  detailModalId: null,
  currentZoom: 12,
  boundary: null,
  drawActive: false,
  isLoading: false,
  authModalOpen: false,
  token: null,
  user: null,
 
  // Reset total alongside listings so stale total never shows while new listings load.
  setListings: (listings) => set({ listings, total: 0 }),
  setTotal: (total) => set({ total }),
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
  setAuth: (token, user) => set({ token, user }),
  bumpMapRefresh: () => set((state) => ({ mapRefreshTick: state.mapRefreshTick + 1 })),
  setDetailModalId: (id) => set({ detailModalId: id }),
  setCurrentZoom: (zoom) => set({ currentZoom: zoom }),
}));

// Load initial auth credentials asynchronously
getStoredAuth().then(({ token, user }) => {
  if (token) {
    useListingsStore.setState({ token, user });
  }

  // On Web, check if there's an active NextAuth session via HTTP-only cookies
  if (Platform.OS === "web") {
    fetch(`${API_BASE_URL}/api/auth/session`, { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error();
      })
      .then((data) => {
        if (data && data.user) {
          useListingsStore.setState({
            token: "next-auth-cookie-session", // Sentinel to indicate cookie-based login
            user: data.user,
          });
        }
      })
      .catch(() => {});
  }
});
