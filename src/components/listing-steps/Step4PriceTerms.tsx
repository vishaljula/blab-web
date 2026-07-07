"use client";

import { useState } from "react";
import { useListingFormStore, type Furnishing, type PreferredTenant } from "@/store/listingForm";

const FURNISHING_OPTIONS: { id: Furnishing; label: string; desc: string }[] = [
  { id: "unfurnished", label: "Unfurnished",       desc: "No furniture — bare unit" },
  { id: "semi",        label: "Semi-furnished",    desc: "Fixtures, fans, lights provided" },
  { id: "fully",       label: "Fully furnished",   desc: "Move-in ready with all furniture" },
];
const TENANT_OPTIONS: { id: PreferredTenant; label: string; icon: string }[] = [
  { id: "family",   label: "Family",   icon: "👨‍👩‍👧‍👦" },
  { id: "bachelor", label: "Bachelor", icon: "🧑" },
  { id: "any",      label: "Anyone",   icon: "🤝" },
];

export default function Step4PriceTerms() {
  const store = useListingFormStore();
  const { listingType, goNext } = store;

  const isRent = listingType === "rent";

  const [price, setPrice] = useState(store.price?.toString() ?? "");
  const [negotiable, setNegotiable] = useState(store.negotiable ?? true);
  const [deposit, setDeposit] = useState(store.securityDeposit?.toString() ?? "");
  const [maintenance, setMaintenance] = useState(store.maintenance?.toString() ?? "");
  const [furnishing, setFurnishing] = useState<Furnishing | null>(store.furnishing);
  const [tenant, setTenant] = useState<PreferredTenant | null>(store.preferredTenant);
  const [availableFrom, setAvailableFrom] = useState(store.availableFrom ?? "");

  const canProceed = price.trim().length > 0 && parseInt(price, 10) > 0;

  const handleNext = () => {
    store.setStep4({
      price: parseInt(price, 10),
      negotiable,
      securityDeposit: deposit ? parseInt(deposit, 10) : null,
      maintenance: maintenance ? parseInt(maintenance, 10) : null,
      furnishing,
      preferredTenant: tenant,
      availableFrom: availableFrom || null,
    });
    goNext();
  };

  const formatINR = (val: string) => {
    const n = parseInt(val, 10);
    if (isNaN(n)) return "";
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
    return `₹${n}`;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {isRent ? "Set the rent" : "Set your asking price"}
        </h1>
        <p className="text-muted-foreground">
          {isRent ? "Monthly rent and terms for your tenant." : "What are you expecting to sell for?"}
        </p>
      </div>

      {/* Primary price input */}
      <div className="mb-7">
        <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
          {isRent ? "Monthly rent (₹)" : "Asking price (₹)"}
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₹</span>
          <input
            id="step4-price-input"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={isRent ? "e.g. 25000" : "e.g. 8500000"}
            min="0"
            className="w-full pl-8 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
          />
        </div>
        {price && parseInt(price, 10) > 0 && (
          <p className="text-xs text-primary font-medium mt-1.5">{formatINR(price)}</p>
        )}
      </div>

      {/* Negotiable toggle */}
      <div className="mb-7 flex items-center justify-between px-4 py-4 rounded-xl border border-border bg-card">
        <div>
          <p className="text-sm font-semibold text-foreground">Open to negotiation?</p>
          <p className="text-xs text-muted-foreground mt-0.5">Buyers/tenants can make an offer</p>
        </div>
        <button
          id="step4-negotiable-toggle"
          onClick={() => setNegotiable(!negotiable)}
          className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${negotiable ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${negotiable ? "translate-x-6" : "translate-x-0"}`}
          />
        </button>
      </div>

      {/* Rental-specific fields */}
      {isRent && (
        <>
          {/* Security deposit */}
          <div className="mb-5">
            <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Security deposit (₹) <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₹</span>
              <input
                id="step4-deposit-input"
                type="number"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="e.g. 100000"
                min="0"
                className="w-full pl-8 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
              />
            </div>
          </div>

          {/* Maintenance */}
          <div className="mb-7">
            <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Maintenance charges / month (₹) <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₹</span>
              <input
                id="step4-maintenance-input"
                type="number"
                value={maintenance}
                onChange={(e) => setMaintenance(e.target.value)}
                placeholder="e.g. 3000"
                min="0"
                className="w-full pl-8 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
              />
            </div>
          </div>

          {/* Furnishing */}
          <div className="mb-7">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Furnishing</p>
            <div className="flex flex-col gap-2">
              {FURNISHING_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  id={`step4-furnishing-${f.id}`}
                  onClick={() => setFurnishing(furnishing === f.id ? null : f.id)}
                  className={`flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm transition-all duration-150
                    ${furnishing === f.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40"
                    }`}
                >
                  <div className="text-left">
                    <p className={`font-semibold ${furnishing === f.id ? "text-primary" : "text-foreground"}`}>{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                  {furnishing === f.id && (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <circle cx="9" cy="9" r="8" fill="var(--primary)" />
                      <path d="M5.5 9L8 11.5L12.5 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred tenant */}
          <div className="mb-7">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Preferred tenant</p>
            <div className="grid grid-cols-3 gap-3">
              {TENANT_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  id={`step4-tenant-${t.id}`}
                  onClick={() => setTenant(tenant === t.id ? null : t.id)}
                  className={`flex flex-col items-center py-4 rounded-xl border-2 text-sm font-medium transition-all duration-150
                    ${tenant === t.id
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/40"
                    }`}
                >
                  <span className="text-2xl mb-1">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Available from */}
          <div className="mb-8">
            <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Available from <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
            </label>
            <input
              id="step4-available-from-input"
              type="date"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-4 py-3.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
            />
          </div>
        </>
      )}

      {/* Sale maintenance (optional) */}
      {!isRent && (
        <div className="mb-8">
          <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Monthly maintenance (₹) <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₹</span>
            <input
              id="step4-maintenance-input"
              type="number"
              value={maintenance}
              onChange={(e) => setMaintenance(e.target.value)}
              placeholder="e.g. 5000"
              min="0"
              className="w-full pl-8 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
            />
          </div>
        </div>
      )}

      <button
        id="step4-next-btn"
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
