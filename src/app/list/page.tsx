"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useListingFormStore } from "@/store/listingForm";
import Step1PropertyType from "@/components/listing-steps/Step1PropertyType";
import Step2Location from "@/components/listing-steps/Step2Location";
import Step3Details from "@/components/listing-steps/Step3Details";
import Step4PriceTerms from "@/components/listing-steps/Step4PriceTerms";
import Step5Amenities from "@/components/listing-steps/Step5Amenities";
import Step6Description from "@/components/listing-steps/Step6Description";
import Step7ListingPath from "@/components/listing-steps/Step7ListingPath";
import Step8Review from "@/components/listing-steps/Step8Review";

const STEP_LABELS = [
  "Property type",
  "Location",
  "Details",
  "Price & terms",
  "Amenities",
  "Description",
  "Listing type",
  "Review",
];

export default function ListPage() {
  const { status } = useSession();
  const router = useRouter();
  const { currentStep, totalSteps, goBack } = useListingFormStore();

  // Auth gate — redirect unauthenticated users to login, return here after
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/?login=true&redirect=/list");
    }
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const progress = (currentStep / totalSteps) * 100;

  const STEPS = [
    <Step1PropertyType key={1} />,
    <Step2Location key={2} />,
    <Step3Details key={3} />,
    <Step4PriceTerms key={4} />,
    <Step5Amenities key={5} />,
    <Step6Description key={6} />,
    <Step7ListingPath key={7} />,
    <Step8Review key={8} />,
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <button
            onClick={() => (currentStep === 1 ? router.push("/") : goBack())}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            id="list-back-btn"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {currentStep === 1 ? "Exit" : "Back"}
          </button>

          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-medium text-muted-foreground tracking-wider uppercase">
              Step {currentStep} of {totalSteps}
            </span>
            <span className="text-xs text-muted-foreground/70">
              {STEP_LABELS[currentStep - 1]}
            </span>
          </div>

          {/* Save & exit — saves draft to localStorage for later */}
          <button
            onClick={() => router.push("/")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            id="list-save-exit-btn"
          >
            Save & exit
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-border">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Step content ─────────────────────────────────────────────────── */}
      <main className="flex-1 pt-[72px] pb-4">
        <div
          key={currentStep}
          className="animate-in fade-in slide-in-from-right-4 duration-300"
        >
          {STEPS[currentStep - 1]}
        </div>
      </main>
    </div>
  );
}
