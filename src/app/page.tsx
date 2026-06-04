"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import ControlBar from "@/components/ControlBar";
import ListView from "@/components/ListView";
import ViewToggleFab from "@/components/ViewToggleFab";
import AuthModal from "@/components/AuthModal";
import BottomNavigation from "@/components/BottomNavigation";
import ProfileModal from "@/components/ProfileModal";
import PropertyCard from "@/components/PropertyCard";

// MapView uses Mapbox SDK which requires browser APIs.
// Importing with ssr:false prevents server rendering and eliminates hydration mismatches.
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
import { useListingsStore } from "@/store/listings";

function HomeDashboard() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [isDesktop, setIsDesktop] = useState(false);
  const {
    drawActive,
    boundary,
    viewportBounds,
    clearBoundary,
    toggleDraw,
    setListings,
    addListings,
    setIsLoading,
    listingType,
    authModalOpen,
    setAuthModalOpen,
    profileModalOpen,
    setProfileModalOpen,
    selectedListing,
    setSelectedListing,
  } = useListingsStore();

  // Handle client-side media query for desktop split pane
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const listener = () => setIsDesktop(media.matches);
    setIsDesktop(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  // Abort controller ref to cancel in-flight requests
  const abortRef = useRef<AbortController | null>(null);
  // Track what we last fetched to avoid redundant re-fetches when only viewport pans
  const lastFetchKeyRef = useRef<string>("");

  // Fetch listings from API whenever viewport, boundary, or listingType changes
  useEffect(() => {
    // Build a key representing what we're about to fetch.
    // Boundary-based fetches use the boundary identity; viewport fetches use bounds.
    let fetchKey: string;
    let isViewportFetch = false;

    if (boundary?.type === "polygon" && boundary.coordinates) {
      fetchKey = `polygon:${JSON.stringify(boundary.coordinates)}:${listingType}`;
    } else if (boundary?.type === "city" && boundary.geometry) {
      fetchKey = `city:${boundary.label}:${listingType}`;
    } else if (boundary) {
      // Boundary exists but geometry not loaded yet — don't fetch
      return;
    } else if (viewportBounds && !drawActive) {
      fetchKey = `viewport:${viewportBounds.join(",")}:${listingType}`;
      isViewportFetch = true;
    } else {
      return;
    }

    // For boundary-based fetches, skip if we already fetched this exact boundary+type.
    // This prevents re-POSTing the same city/polygon geometry on every viewport pan.
    // Viewport fetches always proceed (each pan produces a unique key anyway).
    if (!isViewportFetch && fetchKey === lastFetchKeyRef.current) return;
    lastFetchKeyRef.current = fetchKey;

    // Cancel previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchListings() {
      setIsLoading(true);
      try {
        let url: string;
        let options: RequestInit = { signal: controller.signal };
        let useAddListings = false;

        if (boundary?.type === "polygon" && boundary.coordinates) {
          url = "/api/listings/polygon";
          options = {
            ...options,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              coordinates: boundary.coordinates,
              listingType,
            }),
          };
          useAddListings = true;
        } else if (boundary?.type === "city" && boundary.geometry) {
          url = "/api/listings/polygon";
          options = {
            ...options,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              geometry: boundary.geometry,
              listingType,
            }),
          };
        } else if (isViewportFetch && viewportBounds) {
          const [swLng, swLat, neLng, neLat] = viewportBounds;
          url = `/api/listings/viewport?sw_lng=${swLng}&sw_lat=${swLat}&ne_lng=${neLng}&ne_lat=${neLat}&type=${listingType}`;
          useAddListings = true; // accumulate — old markers persist as you pan
        } else {
          return;
        }

        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();

        if (useAddListings) {
          addListings(data);
        } else {
          setListings(data);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Failed to fetch listings:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchListings();

    return () => controller.abort();
  }, [viewportBounds, boundary, drawActive, listingType, setListings, addListings, setIsLoading]);

  // Automatically open AuthModal if user is authenticated but has not completed onboarding
  useEffect(() => {
    if (status === "authenticated" && !session?.user?.name) {
      setAuthModalOpen(true);
    }
  }, [status, session, setAuthModalOpen]);

  const showLogin = searchParams.get("login") === "true";

  // Automatically open AuthModal if ?login=true query parameter is present
  useEffect(() => {
    if (showLogin) {
      setAuthModalOpen(true);
    }
  }, [showLogin, setAuthModalOpen]);

  const handleCloseModal = () => {
    setAuthModalOpen(false);
    if (searchParams.get("login") === "true") {
      router.replace("/");
    }
  };

  const handleCloseProfileModal = () => {
    setProfileModalOpen(false);
  };

  const handlePostClick = () => {
    if (status !== "authenticated") {
      setAuthModalOpen(true);
      return;
    }
    const userRole = (session?.user as any)?.role;
    if (userRole === "buyer") {
      alert("Buyers cannot create listings. Please edit your role in your profile to Owner, Broker, or Developer.");
      return;
    }
    alert("Listing wizard opening...");
  };

  const handleProfileClick = () => {
    if (status !== "authenticated") {
      setAuthModalOpen(true);
    } else {
      setProfileModalOpen(true);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Header />
      <ControlBar
        drawActive={drawActive}
        hasBoundary={!!boundary}
        onToggleDraw={toggleDraw}
        onClearBoundary={clearBoundary}
      />

      {/*
        Desktop: side-by-side flex split.
        Mobile: single flex child (preserves the exact container dimensions from the
        staged baseline); inside, both panels are always mounted using visibility:hidden
        so MapView never unmounts — the SDK stays alive and getZoom() always works.
      */}
      <main className="flex-1 flex overflow-hidden relative">
        {isDesktop ? (
          <>
            <div className="flex-[3] relative overflow-hidden h-full">
              <MapView />
            </div>
            <div className="flex-[2] overflow-hidden h-full border-l border-border">
              <ListView />
            </div>
          </>
        ) : (
          <div className="flex-1 relative overflow-hidden h-full">
            <div className={`absolute inset-x-0 top-0 bottom-16${viewMode !== "map" ? " invisible" : ""}`}>
              <MapView />
            </div>
            <div className={`absolute inset-x-0 top-0 bottom-16 overflow-hidden${viewMode !== "list" ? " invisible" : ""}`}>
              <ListView />
            </div>
          </div>
        )}
      </main>

      {!(viewMode === "map" && selectedListing && !isDesktop) && (
        <ViewToggleFab
          currentView={viewMode}
          onToggle={() => setViewMode((prev) => (prev === "map" ? "list" : "map"))}
        />
      )}
      {!isDesktop && viewMode === "map" && selectedListing && (
        <div className="fixed bottom-[70px] left-2 right-2 z-40 max-w-md mx-auto animate-in slide-in-from-bottom duration-300">
          <PropertyCard
            listing={selectedListing}
            onClose={() => setSelectedListing(null)}
          />
        </div>
      )}
      <BottomNavigation
        onPostClick={handlePostClick}
        onProfileClick={handleProfileClick}
      />
      <AuthModal isOpen={authModalOpen} onClose={handleCloseModal} />
      <ProfileModal isOpen={profileModalOpen} onClose={handleCloseProfileModal} />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-background" />}>
      <HomeDashboard />
    </Suspense>
  );
}

