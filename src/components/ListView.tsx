"use client";

import { useListingsStore } from "@/store/listings";
import PropertyCard from "./PropertyCard";

export default function ListView() {
  const { listings, setSelectedListing } = useListingsStore();

  return (
    <div
      className="absolute inset-0 overflow-y-auto p-3 bg-muted/40 flex flex-col gap-3"
      id="list-view"
    >
      {/* Count header */}
      <div className="flex items-center justify-between py-1">
        <span className="text-[0.8125rem] text-muted-foreground">
          {listings.length} {listings.length === 1 ? "property" : "properties"} found
        </span>
      </div>

      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center p-8">
          <span className="text-4xl">🏠</span>
          <p className="text-[0.9375rem] text-muted-foreground">
            No properties found in this area
          </p>
          <p className="text-[0.8125rem] text-muted-foreground/70">
            Try searching a different city or adjusting the map
          </p>
        </div>
      ) : (
        listings.map((listing) => (
          <PropertyCard
            key={listing.id}
            listing={listing}
            onClick={() => setSelectedListing(listing)}
          />
        ))
      )}
    </div>
  );
}
