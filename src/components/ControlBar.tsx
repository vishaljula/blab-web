"use client";

import { Pencil, X, ChevronDown, SlidersHorizontal, Check } from "lucide-react";
import { useListingsStore } from "@/store/listings";
import { cn } from "@/lib/utils";

interface ControlBarProps {
  drawActive: boolean;
  hasBoundary: boolean;
  onToggleDraw: () => void;
  onClearBoundary: () => void;
}

// Shared pill-chip base classes
const chipBase =
  "inline-flex items-center gap-1.5 px-3 h-8 rounded-full border border-foreground/15 text-[0.8125rem] font-medium bg-background text-foreground whitespace-nowrap cursor-pointer select-none transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 hover:bg-muted";

export default function ControlBar({
  drawActive,
  hasBoundary,
  onToggleDraw,
  onClearBoundary,
}: ControlBarProps) {
  const { listingType, setListingType } = useListingsStore();

  return (
    <div
      className="flex items-center gap-2 h-12 px-4 bg-background border-b border-border z-50 shrink-0 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-6"
      id="control-bar"
    >
      {/* For Sale / For Rent toggle */}
      <button
        className={cn(chipBase)}
        id="listing-type-toggle"
        onClick={() => setListingType(listingType === "sale" ? "rent" : "sale")}
      >
        {listingType === "sale" ? "For Sale" : "For Rent"}
        <ChevronDown size={14} />
      </button>

      {/* Draw — morphs to Done when active */}
      <button
        className={cn(
          chipBase,
          drawActive && "bg-foreground text-background border-foreground hover:opacity-90"
        )}
        id="draw-boundary-btn"
        onClick={onToggleDraw}
        title={drawActive ? "Exit draw mode" : "Draw an area to search within"}
      >
        {drawActive ? <Check size={14} /> : <Pencil size={14} />}
        {drawActive ? "Done" : "Draw"}
      </button>

      {/* Clear — only shown when a boundary is active */}
      {hasBoundary && (
        <button
          className={cn(chipBase, "border-destructive/50 text-destructive hover:bg-destructive/10")}
          id="remove-boundary-btn"
          onClick={onClearBoundary}
        >
          <X size={14} />
          Clear
        </button>
      )}

      {/* Filters — coming soon */}
      <button
        className={cn(chipBase, "border-border text-muted-foreground bg-background opacity-40 cursor-not-allowed")}
        id="filters-btn"
        disabled
        title="Coming soon"
      >
        <SlidersHorizontal size={14} />
        Filters
      </button>
    </div>
  );
}
