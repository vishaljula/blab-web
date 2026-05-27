"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import ControlBar from "@/components/ControlBar";
import ListView from "@/components/ListView";
import ViewToggleFab from "@/components/ViewToggleFab";

// Legacy page — uses Mapbox MapView (original implementation)
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
import { useListingsStore } from "@/store/listings";

export default function LegacyHomePage() {
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const {
    drawActive,
    boundary,
    viewportBounds,
    clearBoundary,
    toggleDraw,
    setListings,
    setIsLoading,
    listingType,
  } = useListingsStore();

  // Abort controller ref to cancel in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  // Fetch listings from API whenever viewport, boundary, or listingType changes
  useEffect(() => {
    // Cancel previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchListings() {
      setIsLoading(true);
      try {
        let url: string;
        let options: RequestInit = { signal: controller.signal };

        if (boundary?.type === "polygon" && boundary.coordinates) {
          // Polygon search — POST with drawn coordinates
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
        } else if (viewportBounds) {
          // Viewport search — GET with bounding box
          const [swLng, swLat, neLng, neLat] = viewportBounds;
          url = `/api/listings/viewport?sw_lng=${swLng}&sw_lat=${swLat}&ne_lng=${neLng}&ne_lat=${neLat}&type=${listingType}`;
        } else {
          // No bounds yet (initial load before map fires moveend)
          return;
        }

        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setListings(data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return; // expected
        console.error("Failed to fetch listings:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchListings();

    return () => controller.abort();
  }, [viewportBounds, boundary, listingType, setListings, setIsLoading]);

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => (prev === "map" ? "list" : "map"));
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Header />
      <ControlBar
        drawActive={drawActive}
        hasBoundary={!!boundary}
        onToggleDraw={toggleDraw}
        onClearBoundary={clearBoundary}
      />
      <main className="flex-1 relative overflow-hidden">
        {viewMode === "map" ? <MapView /> : <ListView />}
      </main>
      <ViewToggleFab currentView={viewMode} onToggle={handleToggleView} />
    </div>
  );
}
