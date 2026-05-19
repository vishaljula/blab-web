"use client";

import { formatPrice, formatSpecs } from "@/lib/format";
import type { Listing } from "@/store/listings";

interface PropertyCardProps {
  listing: Listing;
  onClick?: () => void;
}

export default function PropertyCard({ listing, onClick }: PropertyCardProps) {
  return (
    <article className="property-card" onClick={onClick} id={`property-card-${listing.id}`}>
      <div
        className="property-card__image"
        style={{
          backgroundImage: listing.imageUrl
            ? `url(${listing.imageUrl})`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: listing.imageUrl ? undefined : "var(--color-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-tertiary)",
          fontSize: "0.75rem",
        }}
      >
        {!listing.imageUrl && "No Image"}
      </div>

      <div className="property-card__content">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span className="property-card__price">
              {formatPrice(listing.price)}
            </span>
            <span className="property-card__badge">{listing.listerType}</span>
          </div>
          <div className="property-card__specs">
            {formatSpecs(listing)
              .split(" · ")
              .map((spec, i) => (
                <span key={i}>{spec}</span>
              ))}
          </div>
        </div>
        <div className="property-card__location">{listing.address}, {listing.city}</div>
      </div>
    </article>
  );
}
