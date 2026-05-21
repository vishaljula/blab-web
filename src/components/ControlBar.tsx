"use client";

import { Pencil, X, ChevronDown, SlidersHorizontal, Check } from "lucide-react";
import { useListingsStore } from "@/store/listings";

interface ControlBarProps {
  drawActive: boolean;
  hasBoundary: boolean;
  onToggleDraw: () => void;
  onClearBoundary: () => void;
}

export default function ControlBar({
  drawActive,
  hasBoundary,
  onToggleDraw,
  onClearBoundary,
}: ControlBarProps) {
  const { listingType, setListingType } = useListingsStore();

  return (
    <div className="control-bar" id="control-bar">
      {/* For Sale / For Rent Toggle */}
      <button
        className="btn-chip"
        id="listing-type-toggle"
        onClick={() =>
          setListingType(listingType === "sale" ? "rent" : "sale")
        }
      >
        {listingType === "sale" ? "For Sale" : "For Rent"}
        <ChevronDown size={14} />
      </button>

      {/* Draw on Map — morphs into "Done Drawing" button when active */}
      <button
        className={`btn-chip ${drawActive ? "btn-chip--active" : ""}`}
        id="draw-boundary-btn"
        onClick={onToggleDraw}
        title={drawActive ? "Exit draw mode" : "Draw an area to search within"}
      >
        {drawActive ? <Check size={14} /> : <Pencil size={14} />}
        {drawActive ? "Done" : "Draw"}
      </button>

      {/* Clear Boundary (shown when boundary is active) */}
      {hasBoundary && (
        <button
          className="btn-chip btn-chip--danger"
          id="remove-boundary-btn"
          onClick={onClearBoundary}
        >
          <X size={14} />
          Clear
        </button>
      )}

      {/* Filters (MVP 2 — disabled) */}
      <button
        className="btn-chip"
        id="filters-btn"
        disabled
        style={{ opacity: 0.4 }}
        title="Coming soon"
      >
        <SlidersHorizontal size={14} />
        Filters
      </button>
    </div>
  );
}
