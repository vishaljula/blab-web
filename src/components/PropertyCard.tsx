"use client";

import { formatPrice, formatSpecs } from "@/lib/format";
import { useListingsStore, type Listing } from "@/store/listings";

interface PropertyCardProps {
  listing: Listing;
  onClick?: () => void;
}

const listerColors: Record<string, string> = {
  owner: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800",
  broker: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800",
  developer: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800",
};

export default function PropertyCard({ listing, onClick }: PropertyCardProps) {
  const { setHoveredListingId } = useListingsStore();

  return (
    <article
      className="flex flex-col bg-card rounded-xl border border-border cursor-pointer transition-all duration-200 hover:border-border/60 hover:shadow-md active:scale-[0.99] overflow-hidden"
      onClick={onClick}
      onMouseEnter={() => setHoveredListingId(listing.id)}
      onMouseLeave={() => setHoveredListingId(null)}
      id={`property-card-${listing.id}`}
    >
      {/* Hero image — full-width, 16:10 aspect ratio */}
      <div
        className="relative w-full bg-muted overflow-hidden"
        style={{ aspectRatio: "16 / 8" }}
      >
        {listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={`${listing.address}, ${listing.city}`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <span className="text-3xl">🏠</span>
            <span className="text-xs font-medium">No Image</span>
          </div>
        )}
      </div>

      {/* Property info — stacked below image */}
      <div className="flex flex-col gap-1 p-3.5">
        {/* Price + lister badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-lg font-bold text-foreground tracking-tight leading-tight">
            {formatPrice(listing.price)}
          </span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[0.6875rem] font-semibold border ${
              listerColors[listing.listerType] ?? listerColors.broker
            }`}
          >
            {listing.listerType}
          </span>
        </div>

        {/* Specs */}
        <div className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground">
          {formatSpecs(listing)
            .split(" · ")
            .map((spec, i, arr) => (
              <span key={i} className="flex items-center gap-1">
                {spec}
                {i < arr.length - 1 && (
                  <span className="text-border">·</span>
                )}
              </span>
            ))}
        </div>

        {/* Address */}
        <p className="text-[0.8125rem] text-muted-foreground truncate">
          {listing.address}, {listing.city}
        </p>
      </div>
    </article>
  );
}
