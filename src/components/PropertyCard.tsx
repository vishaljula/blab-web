"use client";

import { formatPrice, formatSpecs } from "@/lib/format";
import type { Listing } from "@/store/listings";
import { Badge } from "@/components/ui/badge";

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
  return (
    <article
      className="flex gap-3 p-3 bg-card rounded-xl border border-border cursor-pointer transition-all duration-200 hover:border-border/60 hover:shadow-sm active:scale-[0.99]"
      onClick={onClick}
      id={`property-card-${listing.id}`}
    >
      {/* Thumbnail */}
      <div
        className="w-[120px] h-[90px] rounded-lg shrink-0 bg-muted flex items-center justify-center text-muted-foreground text-xs overflow-hidden"
        style={
          listing.imageUrl
            ? { backgroundImage: `url(${listing.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        {!listing.imageUrl && "No Image"}
      </div>

      {/* Content */}
      <div className="flex flex-col justify-between flex-1 min-w-0">
        <div className="flex flex-col gap-1">
          {/* Price + badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-[1.0625rem] font-bold text-foreground tracking-tight">
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
        </div>

        {/* Address */}
        <p className="text-[0.8125rem] text-muted-foreground truncate">
          {listing.address}, {listing.city}
        </p>
      </div>
    </article>
  );
}
