# CLAUDE.md — Blab Engineering & Operations Constitution

This file is the authoritative onboarding brief for **Paperclip AI agents**, **Claude Code**, and human contributors working on **Blab** (`/Users/adi/Projects/blab-web`).

---

## 1. Architecture & Hard Boundaries

- **Sole UI Platform:** `expo-app/` (Expo React Native for iOS, Android, and Web).
  - **CRITICAL:** Next.js UI (`src/app/` outside `api/` and `actions/`, and `src/components/`) is **legacy** and MUST NOT be created or modified for feature work.
- **Backend Platform:** `src/app/api/`, `src/app/actions/`, `src/db/`, `src/lib/` (Next.js App Router + Neon PostGIS/H3 + Drizzle ORM).
- **Config-Driven Property Categories:** All 4 categories (**Residential**, **Commercial**, **Industrial**, **Agricultural Land**) are driven by `expo-app/lib/propertyConfig.ts` (`PROPERTY_CONFIGS`). Never hardcode category conditionals when the mapper can own them.
- **Paired File Rule (CRITICAL):** Every feature edit in a web file MUST be mirrored in its native counterpart in the same PR:
  - `expo-app/components/MapView.web.tsx` ↔ `expo-app/components/MapView.tsx`
  - `expo-app/app/property/[id].tsx` (desktop + mobile branches) ↔ `expo-app/components/PropertyDetailModal.tsx`
  - `expo-app/components/ListView.tsx` (web + native branches)
- **Store Defensive Guard Rule:** Always wrap `setListings()` with `Array.isArray(data.listings) ? data.listings : []`, and call `setTotal` in the same `try` block.
- **Platform Styling Rule:** Use `Platform.select()` for shadows, guard `cursor: "pointer"` with `Platform.OS === "web"`, and never use raw CSS `boxShadow` without a web guard.
- **Env Var Pairing Rule:** Expo client vars live in `expo-app/.env` with `EXPO_PUBLIC_` prefix. Server vars live in root `.env.local`. **NEVER commit `.env*` files or place PROD credentials in agent workspaces.**

---

## 2. Live Project Inventory (Check Before Building)

### Expo App Routes (`expo-app/app/`)
- `(tabs)/index.tsx` — 3D Map Explore & Filters
- `(tabs)/post.tsx` + `list/index.tsx` — Config-driven Property Listing Wizard (Self-List & Realtor Handoff)
- `(tabs)/dashboard.tsx` — Realtor Dashboard (`RealtorDashboard.tsx` — Founding 500 Pro / Starter Tier)
- `(tabs)/profile.tsx` — User Profile, Role Switcher (`Member`, `Realtor`, `Builder`, `Shutterbug`), My Listings / My Shoots
- `property/[id].tsx` — Property Detail Page (4 categories + Dynamic In-Place Society Unit Switcher)
- `tracking/[id].tsx` — Live 3D Shutterbug Scooter Road Tracking (`shutterbug.glb` + Arrival Handshake OTP)
- `shutterbug/jobs.tsx` — Shutterbug Field Console (Online toggle, Watchman Key access, OTP, 25-min HD + 9:16 Reel checklist)
- `ops/index.tsx` — Founder Ops Command Center (1,000-Listing Blitz, Founding 500 Tracker, Realtor Overflow Upsell Queue, Silent 70% Watchdog, UAT-only Simulator)
- `login.tsx` — Phone OTP Auth & Onboarding

### Key Next.js API Routes (`src/app/api/`)
- Listings & Spatial: `listings/route.ts`, `listings/[id]/route.ts`, `listings/viewport/route.ts`, `listings/polygon/route.ts`
- Realtors: `realtors/available/route.ts`, `realtors/dashboard/route.ts`, `realtors/leads/route.ts`
- Shutterbug & Shoots: `photography/availability/route.ts`, `photography/bookings/route.ts`, `photography/bookings/[id]/track/route.ts`, `shutterbug/jobs/route.ts`, `shutterbug/jobs/[id]/complete/route.ts`, `shutterbug/location/route.ts`
- Ops, QA & Telemetry: `ops/command-center/route.ts`, `ops/qa-runner/route.ts`, `telemetry/route.ts`
- Auth & User: `mobile-auth/send-otp/route.ts`, `mobile-auth/verify-otp/route.ts`, `mobile-auth/onboarding/route.ts`, `users/my-activity/route.ts`

---

## 3. Six Ironclad Marketplace Invariants (Must Never Break)

1. **Zero Buyer Dead-End Rule:** Every `active` listing MUST resolve to a valid, callable `contactName` and `contactPhone`. Never lock or block a buyer from contacting a property.
2. **Zero Greyed-Out Seller Option Rule:** `/api/realtors/available` MUST only return Realtors who can immediately accept a Seller Handoff. Starter Realtors at their `1` active handoff cap are filtered out at the query level.
3. **Option B Starter Realtor Overflow Fallback:** Starter (free) Realtors hold max `2` active listings under their Realtor badge; Listing `#3+` automatically falls back to Direct Owner (`ownerFallbackPhone`) or Blab Concierge and surfaces the Realtor in the Founder Ops ₹10k Upsell Queue.
4. **Multi-Unit Society Priority & Contact Parity:** Apartment complexes render as `1` map marker representing the `#1` priority unit (Builder's first unit if present, else first Owner unit by `created_at ASC`). Selecting any unit in `Developer Units` or `Owner Units` swaps photos, price, specs, and the sticky bottom contact bar in-place.
5. **UAT vs. PROD Strict Isolation:** Simulation endpoints and UI controls MUST be hard-disabled when `BLAB_ENV === 'production'`.
6. **Two-Layer Verification SOP (Borrowed from Aron Prins Playbook):**
   - **Layer 1 (Implementer):** Run `cd expo-app && npx tsc --noEmit` (0 errors) + verify `GET /api/ops/qa-runner` (`ALL_PASS`) + verify paired-file sync.
   - **Layer 2 (Independent Reviewer / QA):** Independent PR review + Maestro (iOS Simulator) / Playwright (Web) regression check against `PROTECTED_SURFACES.md` before human CEO merges to `main`.

---

## 4. Protected Surfaces Governance

Always read `PROTECTED_SURFACES.md` before proposing or making any changes.
**Agents NEVER push directly to `main`.** Open a scoped feature branch (`agent/<role>/<slug>`) and a Draft PR for human CEO approval.
