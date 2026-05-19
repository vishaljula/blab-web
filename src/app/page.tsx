"use client";

import { useState, useCallback, useEffect } from "react";
import Header from "@/components/Header";
import ControlBar from "@/components/ControlBar";
import MapView from "@/components/MapView";
import ListView from "@/components/ListView";
import ViewToggleFab from "@/components/ViewToggleFab";
import { useListingsStore } from "@/store/listings";
import { SEED_LISTINGS } from "@/lib/seed-data";

export default function HomePage() {
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const {
    drawActive,
    boundary,
    clearBoundary,
    toggleDraw,
    setListings,
    listingType,
  } = useListingsStore();

  // Load seed data filtered by listing type
  useEffect(() => {
    const filtered = SEED_LISTINGS.filter((l) => l.listingType === listingType);
    setListings(filtered);
  }, [listingType, setListings]);

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => (prev === "map" ? "list" : "map"));
  }, []);

  return (
    <div className="app-shell">
      <Header />
      <ControlBar
        drawActive={drawActive}
        hasBoundary={!!boundary}
        onToggleDraw={toggleDraw}
        onClearBoundary={clearBoundary}
      />
      <main className="main-content">
        {viewMode === "map" ? <MapView /> : <ListView />}
      </main>
      <ViewToggleFab currentView={viewMode} onToggle={handleToggleView} />
    </div>
  );
}
