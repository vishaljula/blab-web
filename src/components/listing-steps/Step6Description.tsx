"use client";

import { useListingFormStore } from "@/store/listingForm";

const MIN_CHARS = 50;
const MAX_CHARS = 1000;

export default function Step6Description() {
  const { description, setDescription, propertyType, listingType, bedrooms, address, goNext } = useListingFormStore();
  const len = description.length;
  const canProceed = len >= MIN_CHARS;

  // Generate a placeholder example based on what the user has entered
  const example = `e.g. Spacious ${bedrooms ?? 3} BHK ${propertyType ?? "apartment"} ${
    listingType === "rent" ? "available for rent" : "for sale"
  }${address ? ` in ${address.split(",")[0]}` : ""}. Well-ventilated with modular kitchen, ample natural light, and easy access to schools and IT corridor...`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Describe your property</h1>
        <p className="text-muted-foreground">
          A good description gets 3× more inquiries. Tell buyers what makes this property special.
        </p>
      </div>

      {/* Writing tips */}
      <div className="mb-5 p-4 bg-primary/5 rounded-xl border border-primary/20">
        <p className="text-sm font-semibold text-primary mb-2">✍️ Tips for a great description</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Mention the layout and standout features (balcony, kitchen, views)</li>
          <li>• Include connectivity — nearby schools, metro, IT parks</li>
          <li>• Mention move-in condition or recent renovations</li>
          <li>• Keep it factual — no exaggerations</li>
        </ul>
      </div>

      {/* Description textarea */}
      <div className="mb-4 relative">
        <textarea
          id="step6-description-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_CHARS))}
          placeholder={example}
          rows={8}
          className="w-full px-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none leading-relaxed"
        />
        {/* Character count overlay */}
        <div className="absolute bottom-3 right-3">
          <span className={`text-xs font-medium ${
            len < MIN_CHARS ? "text-destructive/70" :
            len > MAX_CHARS * 0.9 ? "text-amber-500" :
            "text-muted-foreground/50"
          }`}>
            {len} / {MAX_CHARS}
          </span>
        </div>
      </div>

      {/* Progress bar to MIN_CHARS */}
      {len < MIN_CHARS && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground/60">Minimum length</span>
            <span className="text-xs text-muted-foreground/60">{MIN_CHARS - len} more characters needed</span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/50 rounded-full transition-all duration-300"
              style={{ width: `${Math.min((len / MIN_CHARS) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* AI-assist stub — future feature */}
      <button
        id="step6-ai-assist-btn"
        disabled
        title="Coming soon — AI will draft a description based on your property details"
        className="mb-8 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-muted-foreground/50 text-sm cursor-not-allowed"
      >
        <span>✨</span>
        Generate draft with AI
        <span className="ml-1 px-1.5 py-0.5 bg-muted rounded text-xs font-medium">Coming soon</span>
      </button>

      <button
        id="step6-next-btn"
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
    </div>
  );
}
