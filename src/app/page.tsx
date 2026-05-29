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
            <div className={`absolute inset-0${viewMode !== "map" ? " invisible" : ""}`}>
              <MapView />
            </div>
            <div className={`absolute inset-0 overflow-hidden${viewMode !== "list" ? " invisible" : ""}`}>
              <ListView />
            </div>
          </div>
        )}
      </main>

      <ViewToggleFab currentView={viewMode} onToggle={handleToggleView} />
    </div>
  );
}
