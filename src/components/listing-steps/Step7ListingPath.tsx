"use client";

import { useState, useEffect } from "react";
import { useListingFormStore, type ListingPath, type RealtorOption } from "@/store/listingForm";

const SELF_FEATURES = [
  "You handle all buyer/tenant calls",
  "You schedule viewings at your convenience",
  "You negotiate directly — no middleman",
  "You complete all paperwork yourself",
  "Listing fee: ₹499 (rental) / ₹999 (sale)",
];

const REALTOR_FEATURES = [
  "Realtor handles all calls & viewings",
  "Professional negotiation on your behalf",
  "Documentation assistance",
  "Blab Verified badge on your listing",
  "Priority placement in search results",
  "No listing fee — covered by realtor's plan",
];

export default function Step7ListingPath() {
  const { setListingPath, listingType, goNext } = useListingFormStore();
  const [selected, setSelected] = useState<ListingPath | null>(null);
  const [realtors, setRealtors] = useState<RealtorOption[]>([]);
  const [loadingRealtors, setLoadingRealtors] = useState(false);
  const [chosenRealtor, setChosenRealtor] = useState<string | null>(null);
  const [showRealtorStep, setShowRealtorStep] = useState(false);

  // Load available realtors when user selects realtor path
  useEffect(() => {
    if (selected !== "realtor" || realtors.length > 0) return;
    setLoadingRealtors(true);
    fetch("/api/realtors/available")
      .then((r) => r.ok ? r.json() : [])
      .then(setRealtors)
      .catch(() => setRealtors([]))
      .finally(() => setLoadingRealtors(false));
  }, [selected]);

  const handleSelfList = () => {
    setSelected("self");
    setShowRealtorStep(false);
  };

  const handleRealtorPath = () => {
    setSelected("realtor");
    setShowRealtorStep(true);
  };

  const handleConfirm = () => {
    if (!selected) return;
    setListingPath(selected, chosenRealtor ?? undefined);
    goNext();
  };

  const cardBase = "relative flex flex-col rounded-2xl border-2 transition-all duration-200 overflow-hidden";
  const cardSelected = "border-primary shadow-lg shadow-primary/10";
  const cardDefault = "border-border hover:border-primary/40";

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">How do you want to list?</h1>
        <p className="text-muted-foreground">Choose who handles the listing process.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {/* Self-list card */}
        <button
          id="step7-self-list-card"
          onClick={handleSelfList}
          className={`${cardBase} ${selected === "self" ? cardSelected : cardDefault} text-left p-5`}
        >
          {selected === "self" && (
            <div className="absolute top-3 right-3 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          <div className="text-3xl mb-3">🏠</div>
          <h3 className="text-base font-bold text-foreground mb-3">List yourself</h3>
          <ul className="space-y-2">
            {SELF_FEATURES.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-muted-foreground/50 mt-0.5 shrink-0">•</span>
                {f}
              </li>
            ))}
          </ul>
        </button>

        {/* Realtor card */}
        <button
          id="step7-realtor-card"
          onClick={handleRealtorPath}
          className={`${cardBase} ${selected === "realtor" ? cardSelected : cardDefault} text-left`}
        >
          {/* Premium gradient header */}
          <div className="bg-gradient-to-br from-primary to-primary/70 px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-3xl">🤝</span>
              {selected === "realtor" && (
                <div className="ml-auto w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
            <h3 className="text-base font-bold text-primary-foreground">List with a Realtor</h3>
            <p className="text-xs text-primary-foreground/70 mt-0.5">Recommended for first-time sellers</p>
          </div>
          <div className="p-5">
            <ul className="space-y-2">
              {REALTOR_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="text-primary mt-0.5 shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {/* Fee transparency note */}
            <div className="mt-4 p-3 bg-muted/50 rounded-xl border border-border">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">ⓘ Industry standard fee: </span>
                {listingType === "rent"
                  ? "1 month's rent (brokerage)"
                  : "1–2% of the transaction value"
                }. You negotiate this directly with your realtor before signing — <span className="font-medium text-foreground">no fixed charge from Blab.</span>
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Realtor selection (shown when realtor path chosen) */}
      {showRealtorStep && (
        <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">Available realtors near your property</p>
            <span className="text-xs text-muted-foreground/60">Curated by Blab</span>
          </div>

          {loadingRealtors ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : realtors.length === 0 ? (
            <div className="py-6 text-center bg-muted/30 rounded-xl border border-border">
              <p className="text-sm text-muted-foreground">No realtors available in your area yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                We'll auto-assign the best available realtor within 24 hours.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {realtors.map((r) => (
                <button
                  key={r.id}
                  id={`step7-realtor-${r.id}`}
                  onClick={() => setChosenRealtor(chosenRealtor === r.id ? null : r.id)}
                  className={`flex items-center gap-4 px-4 py-4 rounded-xl border-2 transition-all duration-150 text-left
                    ${chosenRealtor === r.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40"
                    }`}
                >
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 text-white font-bold text-lg shadow-md">
                    {r.photoUrl
                      ? <img src={r.photoUrl} alt={r.name} className="w-12 h-12 rounded-full object-cover" />
                      : r.name.charAt(0)
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                      {r.isVerified && (
                        <span className="shrink-0 px-1.5 py-0.5 bg-primary/10 rounded-full text-xs font-medium text-primary">
                          Blab Verified
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        🏠 {r.dealsCount} deals
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ⚡ Replies in ~{r.avgResponseHours}h
                      </span>
                    </div>
                  </div>
                  {chosenRealtor === r.id && (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0">
                      <circle cx="10" cy="10" r="9" fill="var(--primary)" />
                      <path d="M6 10L8.5 12.5L14 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}

          {!chosenRealtor && (
            <p className="text-xs text-muted-foreground/60 mt-3 text-center">
              Don't see a perfect match? Skip — we'll auto-assign the best available realtor within 24 hours.
            </p>
          )}
        </div>
      )}

      <button
        id="step7-next-btn"
        onClick={() => selected && handleConfirm()}
        disabled={!selected}
        className={`w-full py-4 rounded-2xl text-base font-bold transition-all duration-200
          ${selected
            ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20 hover:scale-[1.01]"
            : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
      >
        {!selected
          ? "Choose a listing type to continue"
          : selected === "realtor"
            ? chosenRealtor ? "Confirm realtor & continue →" : "Continue without choosing →"
            : "Continue →"
        }
      </button>
    </div>
  );
}
