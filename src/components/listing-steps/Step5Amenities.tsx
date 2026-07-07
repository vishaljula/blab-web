"use client";

import { useListingFormStore } from "@/store/listingForm";

const AMENITY_GROUPS = [
  {
    label: "Essential",
    items: [
      { id: "Power Backup",     icon: "⚡" },
      { id: "Water 24/7",       icon: "💧" },
      { id: "Lift/Elevator",    icon: "🛗" },
      { id: "Security/CCTV",   icon: "📹" },
      { id: "Covered Parking",  icon: "🅿️" },
      { id: "Open Parking",     icon: "🚗" },
    ],
  },
  {
    label: "Lifestyle",
    items: [
      { id: "Swimming Pool",        icon: "🏊" },
      { id: "Gym",                  icon: "🏋️" },
      { id: "Club House",           icon: "🏛️" },
      { id: "Children's Play Area", icon: "🎠" },
      { id: "Garden",               icon: "🌿" },
      { id: "Intercom",             icon: "📞" },
    ],
  },
  {
    label: "Utilities",
    items: [
      { id: "Gas Pipeline",    icon: "🔥" },
      { id: "Modular Kitchen", icon: "🍳" },
      { id: "Vastu Compliant", icon: "🧭" },
      { id: "Gated Community", icon: "🚪" },
    ],
  },
];

export default function Step5Amenities() {
  const { amenities, toggleAmenity, goNext } = useListingFormStore();

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">What amenities does it have?</h1>
        <p className="text-muted-foreground">Select all that apply — you can always edit later.</p>
      </div>

      {/* Selected count badge */}
      {amenities.length > 0 && (
        <div className="mb-5 inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
          <div className="w-2 h-2 bg-primary rounded-full" />
          <span className="text-sm font-medium text-primary">
            {amenities.length} amenit{amenities.length === 1 ? "y" : "ies"} selected
          </span>
        </div>
      )}

      {/* Grouped amenity chips */}
      {AMENITY_GROUPS.map((group) => (
        <div key={group.label} className="mb-7">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {group.items.map((a) => {
              const selected = amenities.includes(a.id);
              return (
                <button
                  key={a.id}
                  id={`step5-amenity-${a.id.replace(/\W+/g, "-").toLowerCase()}`}
                  onClick={() => toggleAmenity(a.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-medium transition-all duration-150
                    ${selected
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent/20"
                    }`}
                >
                  <span>{a.icon}</span>
                  {a.id}
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                      <circle cx="7" cy="7" r="6" fill="var(--primary)" />
                      <path d="M4.5 7L6.5 9L9.5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Skip note */}
      <p className="text-sm text-muted-foreground/60 mb-8">
        Don't see an amenity? Our photographer will note additional features during the visit.
      </p>

      <button
        id="step5-next-btn"
        onClick={goNext}
        className="w-full py-4 rounded-2xl text-base font-bold bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20 hover:scale-[1.01] transition-all duration-200"
      >
        {amenities.length === 0 ? "Skip — continue →" : "Continue →"}
      </button>
    </div>
  );
}
