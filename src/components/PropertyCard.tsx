"use client";

import { useState, useRef, useEffect } from "react";
import { Heart, X } from "lucide-react";
import { formatPrice, formatSpecs } from "@/lib/format";
import { useListingsStore, type Listing } from "@/store/listings";

interface PropertyCardProps {
  listing: Listing;
  onClick?: () => void;
  onClose?: () => void;
}

const listerColors: Record<string, string> = {
  owner: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800",
  broker: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800",
  developer: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800",
};

const STOCK_GALLERY = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80", // kitchen
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80", // living room
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80", // lounge
  "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=800&q=80", // bathroom
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80", // bedroom
  "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80", // dining
];

function getListingPhotos(listing: Listing): string[] {
  const photos = [];
  if (listing.imageUrl) {
    photos.push(listing.imageUrl);
  } else {
    const exteriors = [
      "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80"
    ];
    // Deterministic selection based on listing price seed
    const seed = listing.price || 0;
    photos.push(exteriors[seed % exteriors.length]);
  }

  // Add 3 deterministic interior stock photos based on price
  const idNum = listing.price || 0;
  for (let i = 0; i < 3; i++) {
    const idx = (idNum + i) % STOCK_GALLERY.length;
    photos.push(STOCK_GALLERY[idx]);
  }

  return photos;
}

export default function PropertyCard({ listing, onClick, onClose }: PropertyCardProps) {
  const { setHoveredListingId, selectedListing } = useListingsStore();
  const [activeIdx, setActiveIdx] = useState(0);
  const cardRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isSelected = selectedListing?.id === listing.id;
  const photos = getListingPhotos(listing);

  // Block touch/pointer gestures from reaching the map canvas underneath,
  // but let them propagate normally WITHIN the card so the image carousel
  // can be swiped via native overflow-x scroll.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const stopNativeEvent = (e: Event) => {
      e.stopPropagation();
    };

    const targetEvents = [
      "touchstart",
      "touchmove",
      "touchend",
      "mousedown",
      "mousemove",
      "mouseup",
      "pointerdown",
      "pointermove",
      "pointerup",
    ];

    // Use bubble phase (not capture) so child elements (the scrollable
    // carousel) receive and handle events first. stopPropagation in
    // bubble phase still prevents the event from reaching the map's
    // listeners which are on ancestors above this card.
    targetEvents.forEach((evtName) => {
      el.addEventListener(evtName, stopNativeEvent, { passive: true });
    });

    return () => {
      targetEvents.forEach((evtName) => {
        el.removeEventListener(evtName, stopNativeEvent);
      });
    };
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width > 0) {
      const idx = Math.round(scrollLeft / width);
      setActiveIdx(idx);
    }
  };

  return (
    <article
      ref={cardRef}
      className={`flex flex-col bg-card rounded-xl border cursor-pointer transition-[border-color,box-shadow] duration-200 hover:border-border/60 hover:shadow-md overflow-hidden ${
        isSelected ? "border-primary ring-2 ring-primary ring-offset-1 dark:ring-offset-background" : "border-border"
      }`}
      onClick={onClick}
      onMouseEnter={() => setHoveredListingId(listing.id)}
      onMouseLeave={() => setHoveredListingId(null)}
      id={`property-card-${listing.id}`}
    >
      {/* Hero image carousel — full-width, 16:10 aspect ratio */}
      <div
        className="relative w-full bg-muted overflow-hidden group"
        style={{ aspectRatio: "16 / 10" }}
      >
        {/* Scrollable image track */}
        {/* touch-action: pan-x tells the browser to handle horizontal
            swipes natively on this element instead of delegating to JS */}
        <div
          ref={scrollRef}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none w-full h-full"
          onScroll={handleScroll}
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            touchAction: "pan-x",
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorX: "contain",
          }}
        >
          {photos.map((url, i) => (
            <div key={i} className="w-full h-full shrink-0 snap-start relative" style={{ touchAction: "pan-x" }}>
              <img
                src={url}
                alt={`${listing.address}, ${listing.city} - Photo ${i + 1}`}
                className="w-full h-full object-cover select-none"
                loading={i === 0 ? "eager" : "lazy"}
                draggable={false}
                style={{ touchAction: "pan-x", pointerEvents: "none" }}
              />
            </div>
          ))}
        </div>

        {/* Zillow-style floating text overlay label */}
        <span className="absolute top-2.5 left-2.5 px-2 py-1 bg-black/60 text-white rounded text-[10px] font-semibold tracking-wide backdrop-blur-xs uppercase z-10 pointer-events-none">
          {listing.propertyType}
        </span>

        {/* Favorite heart icon */}
        <button
          className="absolute top-2.5 right-2.5 p-1.5 bg-background/80 hover:bg-background rounded-full text-foreground/80 hover:text-red-500 hover:scale-105 active:scale-95 transition-all shadow-md z-10 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            alert("Favorited!");
          }}
          aria-label="Add to favorites"
        >
          <Heart className="w-4 h-4" />
        </button>

        {/* Optional close (X) button for floating overlays */}
        {onClose && (
          <button
            className="absolute top-2.5 right-12 p-1.5 bg-background/80 hover:bg-background rounded-full text-foreground/80 hover:scale-105 active:scale-95 transition-all shadow-md z-10 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close details"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Scroll indicator page dots */}
        {photos.length > 1 && (
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/45 backdrop-blur-xs px-2.5 py-1 rounded-full z-10">
            {photos.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                  activeIdx === i ? "bg-white scale-110" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Property info — stacked below image */}
      <div className="flex flex-col gap-0.5 p-2.5">
        {/* Price + lister badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-base font-bold text-foreground tracking-tight leading-tight">
            {formatPrice(listing.price)}
          </span>
          <span
            className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold border ${
              listerColors[listing.listerType] ?? listerColors.broker
            }`}
          >
            {listing.listerType}
          </span>
        </div>

        {/* Specs */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
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
        <p className="text-[11px] text-muted-foreground truncate">
          {listing.address}, {listing.city}
        </p>
      </div>
    </article>
  );
}
