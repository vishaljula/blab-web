"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import ControlBar from "@/components/ControlBar";
import ListView from "@/components/ListView";
import ViewToggleFab from "@/components/ViewToggleFab";

// MapView uses Mappls SDK which requires browser APIs.
// Importing with ssr:false prevents server rendering and eliminates hydration mismatches.
const MapView = dynamic(() => import("@/components/MapplsMapView"), { ssr: false });
import { useListingsStore } from "@/store/listings";

export default function HomePage() {
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
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
        let useAddListings = false; // merge instead of replace for drawn polygons

        if (boundary?.type === "polygon" && boundary.coordinates) {
          // Drawn polygon — POST with drawn coordinates, accumulate results
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
          useAddListings = true; // merge with existing listings
        } else if (boundary?.type === "city" && boundary.geometry) {
          // City boundary with actual polygon geometry from OSM
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
        } else if (boundary) {
          // Boundary exists but geometry not loaded yet (async OSM fetch in progress)
          // Don't fall through to viewport — wait for geometry
          return;
        } else if (viewportBounds && !drawActive) {
          // No boundary and not in draw mode — viewport search with bounding box
          const [swLng, swLat, neLng, neLat] = viewportBounds;
          url = `/api/listings/viewport?sw_lng=${swLng}&sw_lat=${swLat}&ne_lng=${neLng}&ne_lat=${neLat}&type=${listingType}`;
        } else {
          // No bounds yet, or in draw mode waiting for first polygon
          return;
        }

        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();

        if (useAddListings) {
          addListings(data); // merge with existing — preserves previous polygon results
        } else {
          setListings(data); // replace — city search or viewport
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return; // expected
        console.error("Failed to fetch listings:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchListings();

    return () => controller.abort();
  }, [viewportBounds, boundary, drawActive, listingType, setListings, addListings, setIsLoading]);

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
