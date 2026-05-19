"use client";

import { useListingsStore } from "@/store/listings";
import PropertyCard from "./PropertyCard";

export default function ListView() {
  const { listings, setSelectedListing } = useListingsStore();

  return (
    <div className="list-view" id="list-view">
      <div className="list-view__header">
        <span className="list-view__count">
          {listings.length} {listings.length === 1 ? "property" : "properties"} found
        </span>
      </div>

      {listings.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: "var(--space-3)",
            color: "var(--color-text-tertiary)",
            textAlign: "center",
            padding: "var(--space-8)",
          }}
        >
          <span style={{ fontSize: "2rem" }}>🏠</span>
          <p className="text-body" style={{ color: "var(--color-text-secondary)" }}>
            No properties found in this area
          </p>
          <p className="text-body-sm">
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
