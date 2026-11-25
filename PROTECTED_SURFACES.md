# PROTECTED_SURFACES.md — Blab UX & Logic Guardrails

## Policy: "Critique Allowed, Silent Edits Forbidden"

1. **Every agent (UXD, QA, Code Reviewer, Engineer) IS encouraged to inspect and critique** any screen or flow below—including spotting bugs, accessibility flaws, dark-mode contrast issues, or UX friction you believe the Founder missed.
2. **Silent edits are strictly forbidden.** No agent may modify any file listed under **Protected Surfaces** without an explicit **CEO Unlock Approval** recorded on a Paperclip ticket before coding begins.
3. Any PR that modifies a shared component (`theme.ts`, `PropertyCard.tsx`, `WizardShell.tsx`, `listings/[id]/route.ts`) MUST include before/after screenshots and QA regression confirmation for the affected Protected Surfaces.

---

## 🔒 Protected Surfaces (Propose-Only — CEO Unlock Required)

| Surface | Key Files | What Must Be Preserved |
| :--- | :--- | :--- |
| **1. Live 3D Shutterbug Tracking** | `expo-app/app/tracking/[id].tsx`, `expo-app/lib/driverMotion.ts`, `expo-app/assets/models/shutterbug.glb`, `src/lib/location-store.ts` | Frame-0 3D scooter + road polyline rendering, street camera bounds, non-overflowing `ARRIVAL HANDSHAKE CODE` pill. |
| **2. Multi-Unit Society Dynamic Switcher** | `expo-app/app/property/[id].tsx`, `expo-app/components/PropertyDetailModal.tsx`, `src/app/api/listings/[id]/route.ts`, `src/app/api/listings/viewport/route.ts` | 1 marker per apartment complex on map; Builder #1 priority + Owner FCFS (`created_at ASC`); `DEVELOPER UNITS` & `OWNER UNITS` headings; 0ms in-place swap of photos, price, specs & sticky bottom contact bar. |
| **3. Express Shoot & Zero-Flash Navigation** | `expo-app/components/listing-steps/Step5Schedule.tsx`, `expo-app/app/(tabs)/post.tsx`, `expo-app/app/_layout.tsx` | Clean `⚡ Express Shoot` + `Available` pill; zero flash of Create Listing screen when navigating to `/tracking/[id]` or back to Map. |
| **4. Founding 500 Pricing & Option B Fallback** | `src/app/api/listings/[id]/route.ts`, `src/app/api/realtors/available/route.ts`, `src/app/api/realtors/dashboard/route.ts` | Founding 500 (`₹0 till Mar 31 → ₹10,000/yr` vs `₹3,000/mo`); Starter cap (`2` active listings, `1` handoff); Option B Direct Owner fallback on Listing #3+; zero greyed-out realtors for sellers. |
| **5. Founder Ops Command Center & Telemetry** | `expo-app/app/ops/index.tsx`, `src/app/api/ops/command-center/route.ts`, `src/app/api/ops/qa-runner/route.ts`, `src/app/api/telemetry/route.ts` | UAT vs PROD strict gate (`BLAB_ENV=production` disables simulator), Realtor ₹10k Upsell Queue, Silent 70% Watchdog, 10/10 QA Invariants. |

---

## 🎨 Open for UXD Audit (First Read-Only Assignment Scope)

- **Flow #1 (Recommended First Read-Only Audit):** `expo-app/app/(tabs)/profile.tsx` + `expo-app/components/realtor/RealtorDashboard.tsx`
  - **Deliverable:** Read-only visual critique with live iOS + Web screenshots, modern typography/spacing/hierarchy recommendations (`Impeccable` + Expo design standards), and a QA regression baseline saved outside app source (`qa-baselines/`).
  - **Gate:** Zero edits to app source until Founder CEO reviews the critique and approves a scoped prototype ticket.
- **Future Audit Queue (Locked until Flow #1 Approved):** Post Wizard (`Step1–Step4`), Commercial / Industrial / Agricultural Detail polish, Map Explore filters & preview cards.
