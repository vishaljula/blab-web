"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useListingFormStore, buildListingPayload } from "@/store/listingForm";

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "Apartment",
  independent_house: "Independent House",
  villa: "Villa",
  plot: "Plot / Land",
  commercial: "Commercial",
  pg: "PG / Co-living",
};

const AGE_LABELS: Record<string, string> = {
  new: "New / Under construction",
  lt5: "Less than 5 years",
  "5to10": "5 – 10 years",
  "10to20": "10 – 20 years",
  gt20: "20+ years",
};

function formatINR(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n}`;
}

export default function Step8Review() {
  const store = useListingFormStore();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isRealtorPath = store.listingPath === "realtor";
  const listingFee = store.listingType === "rent" ? 499 : 999;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildListingPayload(store);
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create listing");
      }
      setDone(true);
      store.reset();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-500">
          <span className="text-4xl">🎉</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-3">
          {isRealtorPath ? "We've connected you with a realtor!" : "Listing submitted!"}
        </h1>
        <p className="text-muted-foreground mb-2">
          {isRealtorPath
            ? "Your assigned realtor will call you within a few hours to schedule a visit and complete your listing."
            : "Our photographer will contact you within 24 hours to schedule a shoot. Your listing goes live after verification."
          }
        </p>
        <p className="text-sm text-muted-foreground/60 mb-8">
          {isRealtorPath
            ? "No payment required — this is covered by your realtor's Blab subscription."
            : "Payment processed. Reference ID will be in your email."
          }
        </p>
        <button
          id="step8-go-home-btn"
          onClick={() => router.push("/")}
          className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          Back to map
        </button>
      </div>
    );
  }

  // ── Review screen ───────────────────────────────────────────────────────────
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-5 p-4 bg-card rounded-xl border border-border">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );

  const Row = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex items-start justify-between py-1.5 border-b border-border/50 last:border-0">
        <span className="text-xs text-muted-foreground shrink-0 w-1/2">{label}</span>
        <span className="text-xs text-foreground font-medium text-right">{value}</span>
      </div>
    ) : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Review your listing</h1>
        <p className="text-muted-foreground">Check everything before {isRealtorPath ? "connecting with a realtor" : "paying"}.</p>
      </div>

      <Section title="What you're listing">
        <Row label="Listing type" value={store.listingType === "rent" ? "For Rent" : "For Sale"} />
        <Row label="Property type" value={store.propertyType ? PROPERTY_TYPE_LABELS[store.propertyType] : undefined} />
        <Row label="Listing path" value={isRealtorPath ? "With a Realtor" : "Self-listed"} />
      </Section>

      <Section title="Location">
        <Row label="Address" value={store.address || undefined} />
        <Row label="Floor" value={store.floorNumber != null ? `${store.floorNumber} of ${store.totalFloors ?? "?"}` : undefined} />
        <Row label="Society" value={store.societyName || undefined} />
        <Row label="Pin" value={store.latitude != null ? `${store.latitude.toFixed(4)}, ${store.longitude?.toFixed(4)}` : undefined} />
      </Section>

      <Section title="Property details">
        <Row label="Bedrooms" value={store.bedrooms != null ? String(store.bedrooms) : undefined} />
        <Row label="Bathrooms" value={store.bathrooms != null ? String(store.bathrooms) : undefined} />
        <Row label="Carpet area" value={store.carpetArea ? `${store.carpetArea} ${store.areaUnit}` : undefined} />
        <Row label="Facing" value={store.facing ?? undefined} />
        <Row label="Age" value={store.propertyAge ? AGE_LABELS[store.propertyAge] : undefined} />
      </Section>

      <Section title="Price & terms">
        <Row label={store.listingType === "rent" ? "Monthly rent" : "Asking price"} value={store.price != null ? formatINR(store.price) : undefined} />
        <Row label="Negotiable" value={store.negotiable ? "Yes" : "No"} />
        <Row label="Security deposit" value={store.securityDeposit != null ? formatINR(store.securityDeposit) : undefined} />
        <Row label="Maintenance" value={store.maintenance != null ? `${formatINR(store.maintenance)}/mo` : undefined} />
        <Row label="Furnishing" value={store.furnishing ?? undefined} />
        <Row label="Preferred tenant" value={store.preferredTenant ?? undefined} />
      </Section>

      {store.amenities.length > 0 && (
        <Section title={`Amenities (${store.amenities.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {store.amenities.map((a) => (
              <span key={a} className="px-2 py-1 bg-muted rounded-lg text-xs text-muted-foreground">{a}</span>
            ))}
          </div>
        </Section>
      )}

      {store.description && (
        <Section title="Description">
          <p className="text-xs text-foreground leading-relaxed line-clamp-4">{store.description}</p>
        </Section>
      )}

      {/* Payment / confirmation section */}
      {!isRealtorPath && (
        <div className="mb-6 p-5 bg-primary/5 rounded-2xl border-2 border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-foreground">Listing fee</span>
            <span className="text-2xl font-bold text-primary">₹{listingFee}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Includes professional photography and verification by our team.
            Your listing goes live within 24–48 hours of the photo shoot.
          </p>
        </div>
      )}

      {isRealtorPath && (
        <div className="mb-6 p-4 bg-green-500/10 rounded-xl border border-green-500/20">
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">✓ No payment required</p>
          <p className="text-xs text-muted-foreground mt-1">
            Listing is covered by your realtor's Blab subscription. Your realtor will contact you to arrange a visit.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-destructive/10 rounded-xl border border-destructive/20">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}

      <button
        id="step8-submit-btn"
        onClick={handleSubmit}
        disabled={submitting}
        className={`w-full py-4 rounded-2xl text-base font-bold transition-all duration-200
          ${submitting
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20 hover:scale-[1.01]"
          }`}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Submitting...
          </span>
        ) : isRealtorPath ? (
          "Connect me with a realtor →"
        ) : (
          `Pay ₹${listingFee} & submit listing →`
        )}
      </button>

      <p className="text-center text-xs text-muted-foreground/50 mt-4">
        {isRealtorPath
          ? "Your realtor will reach out within a few hours."
          : "Razorpay payment integration coming soon — listing created in draft mode for now."
        }
      </p>
    </div>
  );
}
