"use client";

import { useMemo } from "react";
import { useListingsStore } from "@/store/listings";
import PropertyCard from "./PropertyCard";

export default function ListView() {
  const { listings, setSelectedListing, viewportBounds, boundary } = useListingsStore();

  const visibleListings = useMemo(() => {
    // When a boundary search is active, the API already scoped the results —
    // don't double-filter by viewport or zooming out hides valid results.
    if (!viewportBounds || boundary) return listings;
    const [swLng, swLat, neLng, neLat] = viewportBounds;
    return listings.filter(
      (l) =>
        l.longitude >= swLng &&
        l.longitude <= neLng &&
        l.latitude >= swLat &&
        l.latitude <= neLat
    );
  }, [listings, viewportBounds, boundary]);

  return (
    <div
      className="h-full overflow-y-auto p-3 bg-muted/40"
      id="list-view"
    >
      {/* Count header */}
      <div className="flex items-center justify-between py-1 mb-3">
        <span className="text-[0.8125rem] text-muted-foreground">
          {visibleListings.length} {visibleListings.length === 1 ? "property" : "properties"} found
        </span>
      </div>

      {visibleListings.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center p-8">
          <span className="text-4xl">🏠</span>
          <p className="text-[0.9375rem] text-muted-foreground">
            No properties found in this area
          </p>
          <p className="text-[0.8125rem] text-muted-foreground/70">
            Try searching a different city or adjusting the map
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleListings.map((listing) => (
            <PropertyCard
              key={listing.id}
              listing={listing}
              onClick={() => setSelectedListing(listing)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
