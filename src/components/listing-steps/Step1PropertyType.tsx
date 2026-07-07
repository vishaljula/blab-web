"use client";

import { useListingFormStore, type ListingType, type PropertyType } from "@/store/listingForm";

const PROPERTY_TYPES: { id: PropertyType; label: string; icon: string; desc: string }[] = [
  { id: "apartment",        label: "Apartment",         icon: "🏢", desc: "Flat in a multi-storey building" },
  { id: "independent_house",label: "Independent House", icon: "🏡", desc: "Stand-alone house on a plot" },
  { id: "villa",            label: "Villa",             icon: "🏰", desc: "Luxury home, often gated community" },
  { id: "plot",             label: "Plot / Land",       icon: "📐", desc: "Vacant land for construction" },
  { id: "commercial",       label: "Commercial",        icon: "🏬", desc: "Office, shop, or co-working space" },
  { id: "pg",               label: "PG / Co-living",   icon: "🛏️", desc: "Paying guest or shared living" },
];

export default function Step1PropertyType() {
  const { listingType, propertyType, setStep1, goNext } = useListingFormStore();

  const canProceed = listingType !== null && propertyType !== null;

  const selectType = (lt: ListingType) => setStep1({ listingType: lt, propertyType: propertyType! });
  const selectProperty = (pt: PropertyType) => setStep1({ listingType: listingType!, propertyType: pt });

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Heading */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-foreground mb-2">What are you listing?</h1>
        <p className="text-muted-foreground">Tell us the basics — we'll customise the rest of the form for you.</p>
      </div>

      {/* Sale / Rent toggle */}
      <div className="mb-10">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Listing purpose</p>
        <div className="grid grid-cols-2 gap-3">
          {(["sale", "rent"] as ListingType[]).map((lt) => (
            <button
              key={lt}
              id={`listing-type-${lt}`}
              onClick={() => selectType(lt)}
              className={`relative flex flex-col items-center justify-center py-6 px-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer
                ${listingType === lt
                  ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                  : "border-border bg-card hover:border-primary/40 hover:bg-accent/30"
                }`}
            >
              <span className="text-3xl mb-2">{lt === "sale" ? "🏷️" : "🔑"}</span>
              <span className="text-base font-semibold text-foreground capitalize">{lt === "sale" ? "For Sale" : "For Rent"}</span>
              <span className="text-xs text-muted-foreground mt-1">
                {lt === "sale" ? "Sell your property" : "Find a tenant"}
              </span>
              {listingType === lt && (
                <div className="absolute top-3 right-3 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Property type grid */}
      <div className="mb-10">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Property type</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PROPERTY_TYPES.map((pt) => (
            <button
              key={pt.id}
              id={`property-type-${pt.id}`}
              onClick={() => listingType && selectProperty(pt.id)}
              disabled={!listingType}
              className={`relative flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-200 text-left
                ${!listingType ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                ${propertyType === pt.id
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border bg-card hover:border-primary/40 hover:bg-accent/30"
                }`}
            >
              <span className="text-2xl mb-2">{pt.icon}</span>
              <span className="text-sm font-semibold text-foreground">{pt.label}</span>
              <span className="text-xs text-muted-foreground mt-0.5 leading-tight">{pt.desc}</span>
              {propertyType === pt.id && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                  <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                    <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Next CTA */}
      <button
        id="step1-next-btn"
        onClick={() => canProceed && goNext()}
        disabled={!canProceed}
        className={`w-full py-4 rounded-2xl text-base font-bold transition-all duration-200
          ${canProceed
            ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20 hover:scale-[1.01]"
            : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
      >
        Continue →
      </button>

      {!listingType && (
        <p className="text-center text-xs text-muted-foreground/70 mt-3">
          Select a listing purpose to continue
        </p>
      )}
    </div>
  );
}
