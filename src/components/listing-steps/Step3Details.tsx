"use client";

import { useState } from "react";
import { useListingFormStore, type Facing, type PropertyAge, type AreaUnit } from "@/store/listingForm";

const BEDROOM_OPTIONS = [0, 1, 2, 3, 4, 5];
const BATHROOM_OPTIONS = [1, 2, 3, 4];
const FACING_OPTIONS: { id: Facing; label: string }[] = [
  { id: "E", label: "East" },
  { id: "W", label: "West" },
  { id: "N", label: "North" },
  { id: "S", label: "South" },
  { id: "Corner", label: "Corner" },
];
const AGE_OPTIONS: { id: PropertyAge; label: string }[] = [
  { id: "new",   label: "New / Under construction" },
  { id: "lt5",   label: "Less than 5 years" },
  { id: "5to10", label: "5 – 10 years" },
  { id: "10to20",label: "10 – 20 years" },
  { id: "gt20",  label: "20+ years" },
];

export default function Step3Details() {
  const store = useListingFormStore();
  const { propertyType, goNext } = store;

  const [bedrooms, setBedrooms] = useState<number | null>(store.bedrooms);
  const [bathrooms, setBathrooms] = useState<number | null>(store.bathrooms);
  const [area, setArea] = useState(store.carpetArea?.toString() ?? "");
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(store.areaUnit);
  const [facing, setFacing] = useState<Facing | null>(store.facing);
  const [age, setAge] = useState<PropertyAge | null>(store.propertyAge);

  const isPlot = propertyType === "plot";
  // Plots don't have bedrooms / bathrooms / area in the same way
  const showBedBath = !isPlot;

  const canProceed = isPlot ? area.trim().length > 0 : (area.trim().length > 0);

  const handleNext = () => {
    store.setStep3({
      bedrooms: showBedBath ? bedrooms : null,
      bathrooms: showBedBath ? bathrooms : null,
      carpetArea: area ? parseInt(area, 10) : null,
      areaUnit,
      facing,
      propertyAge: age,
    });
    goNext();
  };

  const chipBase = "px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-150 cursor-pointer";
  const chipSelected = "border-primary bg-primary/10 text-primary";
  const chipDefault = "border-border bg-card text-foreground hover:border-primary/50";

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Tell us about the property</h1>
        <p className="text-muted-foreground">Size, layout, and basic specs.</p>
      </div>

      {/* Bedrooms */}
      {showBedBath && (
        <div className="mb-7">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Bedrooms</p>
          <div className="flex flex-wrap gap-2">
            {BEDROOM_OPTIONS.map((b) => (
              <button
                key={b}
                id={`step3-bed-${b}`}
                onClick={() => setBedrooms(b)}
                className={`${chipBase} w-14 text-center ${bedrooms === b ? chipSelected : chipDefault}`}
              >
                {b === 0 ? "Studio" : b === 5 ? "5+" : b}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bathrooms */}
      {showBedBath && (
        <div className="mb-7">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Bathrooms</p>
          <div className="flex flex-wrap gap-2">
            {BATHROOM_OPTIONS.map((b) => (
              <button
                key={b}
                id={`step3-bath-${b}`}
                onClick={() => setBathrooms(b)}
                className={`${chipBase} w-14 text-center ${bathrooms === b ? chipSelected : chipDefault}`}
              >
                {b === 4 ? "4+" : b}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Area */}
      <div className="mb-7">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {isPlot ? "Plot area" : "Carpet area"}
        </p>
        <div className="flex gap-3">
          <input
            id="step3-area-input"
            type="number"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="e.g. 1200"
            min="1"
            className="flex-1 px-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
          />
          {/* Unit toggle */}
          <div className="flex rounded-xl border border-border overflow-hidden">
            {(["sqft", "sqm"] as AreaUnit[]).map((u) => (
              <button
                key={u}
                id={`step3-unit-${u}`}
                onClick={() => setAreaUnit(u)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  areaUnit === u ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent/40"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Facing */}
      <div className="mb-7">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Facing direction <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {FACING_OPTIONS.map((f) => (
            <button
              key={f.id}
              id={`step3-facing-${f.id}`}
              onClick={() => setFacing(facing === f.id ? null : f.id)}
              className={`${chipBase} ${facing === f.id ? chipSelected : chipDefault}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Age of property */}
      <div className="mb-10">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Age of property <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
        </p>
        <div className="flex flex-col gap-2">
          {AGE_OPTIONS.map((a) => (
            <button
              key={a.id}
              id={`step3-age-${a.id}`}
              onClick={() => setAge(age === a.id ? null : a.id)}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-150
                ${age === a.id
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/40"
                }`}
            >
              {a.label}
              {age === a.id && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" fill="var(--primary)" />
                  <path d="M5 8L7 10L11 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      <button
        id="step3-next-btn"
        onClick={() => canProceed && handleNext()}
        disabled={!canProceed}
        className={`w-full py-4 rounded-2xl text-base font-bold transition-all duration-200
          ${canProceed
            ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20 hover:scale-[1.01]"
            : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
      >
        Continue →
      </button>
    </div>
  );
}
